import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/adminAuth";
import { getGoogleMapsSearchUrl } from "@/lib/googleMaps";
import { isGoogleMapsUrl, resolveGoogleMapsPlaceInfo } from "@/lib/googleMapsPlace";
import { DEFAULT_RAMEN_STYLES, classifyRamenStyles } from "@/lib/ramenStyles";
import { slugify } from "@/lib/slug";

type Body = {
  action: "approve" | "reject" | "duplicate" | "update";
  review_note?: string | null;
  duplicate_of?: string | null;
  fields?: Record<string, unknown>;
};

const styleNameToSlug = new Map<string, string>(DEFAULT_RAMEN_STYLES.map((style) => [style.name, style.slug]));
const PLACEHOLDER_SUBMISSION_NAMES = new Set(["Google Maps submission pending parse", "Google Maps 投稿待解析", "待解析 Google Maps 投稿"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as Body;

  if (body.action === "update") {
    const update = await enrichSubmissionFields(sanitizeSubmissionFields(body.fields ?? {}));
    const updated = await admin.supabase
      .from("shop_submissions")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (!updated.error) {
      return NextResponse.json({ submission: updated.data });
    }

    if ("google_maps_url" in update && isMissingGoogleMapsUrlColumn(updated.error)) {
      const { google_maps_url: _googleMapsUrl, ...retryUpdate } = update;
      const retry = await admin.supabase
        .from("shop_submissions")
        .update({ ...retryUpdate, website_url: String(update.google_maps_url), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

      if (!retry.error) {
        return NextResponse.json({ submission: { ...retry.data, google_maps_url: update.google_maps_url } });
      }
      return NextResponse.json({ error: retry.error.message }, { status: 500 });
    }

    return NextResponse.json({ error: updated.error.message }, { status: 500 });
  }

  if (body.action === "reject" || body.action === "duplicate") {
    const { data, error } = await admin.supabase
      .from("shop_submissions")
      .update({
        status: body.action === "reject" ? "rejected" : "duplicate",
        review_note: body.review_note ?? null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ submission: data });
  }

  if (body.action === "approve") {
    const { data: submission, error: fetchError } = await admin.supabase
      .from("shop_submissions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !submission) {
      return NextResponse.json({ error: fetchError?.message ?? "Submission not found." }, { status: 404 });
    }

    const approvedFields = await enrichSubmissionFields({ ...submission, ...sanitizeSubmissionFields(body.fields ?? {}) });
    const { data: shop, error: insertError } = await admin.supabase
      .from("shops")
      .insert({
        name: approvedFields.name,
        slug: slugify(`${approvedFields.name}-${Date.now()}`),
        address: approvedFields.address,
        latitude: approvedFields.latitude,
        longitude: approvedFields.longitude,
        phone: approvedFields.phone,
        website_url: approvedFields.website_url,
        instagram_url: approvedFields.instagram_url,
        facebook_url: approvedFields.facebook_url,
        google_maps_url: approvedFields.google_maps_url || getGoogleMapsSearchUrl(approvedFields.name, approvedFields.address),
        status: "open",
        source: "user_submission",
        source_id: submission.id,
        description: approvedFields.submitter_note
      })
      .select("id")
      .single();

    if (insertError || !shop) {
      return NextResponse.json({ error: insertError?.message ?? "Failed to create shop." }, { status: 500 });
    }

    const suggested = (approvedFields.suggested_styles ?? []).map((style: string) => styleNameToSlug.get(style) ?? style);
    const inferred = classifyRamenStyles([approvedFields.name, approvedFields.submitter_note, suggested]);
    await insertStyleJoins(admin.supabase, shop.id, Array.from(new Set([...suggested, ...inferred])));

    const { data, error } = await admin.supabase
      .from("shop_submissions")
      .update({ status: "approved", review_note: body.review_note ?? null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ submission: data, shop_id: shop.id });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}

async function enrichSubmissionFields<T extends Record<string, unknown>>(fields: T) {
  const googleMapsUrl = asNullableString(fields.google_maps_url) ?? googleMapsUrlFromFallback(fields.website_url);
  if (!googleMapsUrl) {
    return fields;
  }

  const info = await resolveGoogleMapsPlaceInfo(googleMapsUrl);
  if (!info) {
    return fields;
  }

  return {
    ...fields,
    name: info.name && shouldReplaceSubmissionName(fields.name) ? info.name : fields.name,
    address: !fields.address && info.address ? info.address : fields.address,
    latitude: fields.latitude == null && info.latitude != null ? info.latitude : fields.latitude,
    longitude: fields.longitude == null && info.longitude != null ? info.longitude : fields.longitude,
    google_maps_url: googleMapsUrl
  };
}

function shouldReplaceSubmissionName(value: unknown) {
  const name = asNullableString(value);
  return !name || PLACEHOLDER_SUBMISSION_NAMES.has(name);
}

function sanitizeSubmissionFields(fields: Record<string, unknown>) {
  return compactObject({
    name: asOptionalString(fields.name),
    address: asNullableString(fields.address),
    latitude: asNullableNumber(fields.latitude),
    longitude: asNullableNumber(fields.longitude),
    phone: asNullableString(fields.phone),
    website_url: asNullableString(fields.website_url),
    google_maps_url: asNullableString(fields.google_maps_url),
    instagram_url: asNullableString(fields.instagram_url),
    facebook_url: asNullableString(fields.facebook_url),
    suggested_styles: Array.isArray(fields.suggested_styles) ? fields.suggested_styles.filter((item) => typeof item === "string") : undefined,
    submitter_note: asNullableString(fields.submitter_note),
    submitter_email: asNullableString(fields.submitter_email)
  });
}

async function insertStyleJoins(supabase: SupabaseClient, shopId: string, styleSlugs: string[]) {
  const slugs = styleSlugs.filter(Boolean);
  if (!slugs.length) {
    return;
  }

  const { data: styles } = await supabase.from("ramen_styles").select("id,slug").in("slug", slugs);
  const rows = (styles ?? []).map((style) => ({ shop_id: shopId, style_id: style.id, confidence: 0.85 }));
  if (rows.length) {
    await supabase.from("shop_styles").upsert(rows);
  }
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableNumber(value: unknown) {
  if (value === null || value === "") {
    return null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function googleMapsUrlFromFallback(value: unknown) {
  const url = asNullableString(value);
  return url && isGoogleMapsUrl(url) ? url : null;
}

function isMissingGoogleMapsUrlColumn(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  return error.code === "PGRST204" || /google_maps_url/i.test(message);
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
