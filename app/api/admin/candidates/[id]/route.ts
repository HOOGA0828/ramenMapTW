import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/adminAuth";
import { getGoogleMapsSearchUrl } from "@/lib/googleMaps";
import { classifyRamenStyles } from "@/lib/ramenStyles";
import { slugify } from "@/lib/slug";

type Body = {
  action: "approve" | "reject" | "duplicate" | "update";
  review_note?: string | null;
  duplicate_of?: string | null;
  fields?: Record<string, unknown>;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const body = (await request.json()) as Body;

  if (body.action === "update") {
    const update = sanitizeCandidateFields(body.fields ?? {});
    const { data, error } = await admin.supabase
      .from("candidate_shops")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ candidate: data });
  }

  if (body.action === "reject" || body.action === "duplicate") {
    const { data, error } = await admin.supabase
      .from("candidate_shops")
      .update({
        status: body.action === "reject" ? "rejected" : "duplicate",
        duplicate_of: body.duplicate_of ?? null,
        review_note: body.review_note ?? null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ candidate: data });
  }

  if (body.action === "approve") {
    const { data: candidate, error: fetchError } = await admin.supabase
      .from("candidate_shops")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !candidate) {
      return NextResponse.json({ error: fetchError?.message ?? "Candidate not found." }, { status: 404 });
    }

    const approvedFields = { ...candidate, ...sanitizeCandidateFields(body.fields ?? {}) };
    const { data: shop, error: insertError } = await admin.supabase
      .from("shops")
      .insert({
        name: approvedFields.name,
        slug: slugify(`${approvedFields.name}-${approvedFields.city ?? ""}-${Date.now()}`),
        address: approvedFields.address,
        city: approvedFields.city,
        district: approvedFields.district,
        latitude: approvedFields.latitude,
        longitude: approvedFields.longitude,
        phone: approvedFields.phone,
        website_url: approvedFields.website_url,
        google_maps_url: getGoogleMapsSearchUrl(approvedFields.name, approvedFields.address),
        status: "open",
        source: approvedFields.source,
        source_id: approvedFields.source_id,
        description: null
      })
      .select("id")
      .single();

    if (insertError || !shop) {
      return NextResponse.json({ error: insertError?.message ?? "Failed to create shop." }, { status: 500 });
    }

    const styleSlugs = classifyRamenStyles([approvedFields.name, approvedFields.source_payload]);
    await insertStyleJoins(admin.supabase, shop.id, styleSlugs);

    const { data, error } = await admin.supabase
      .from("candidate_shops")
      .update({ status: "approved", review_note: body.review_note ?? null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ candidate: data, shop_id: shop.id });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}

function sanitizeCandidateFields(fields: Record<string, unknown>) {
  return compactObject({
    name: asOptionalString(fields.name),
    address: asNullableString(fields.address),
    city: asNullableString(fields.city),
    district: asNullableString(fields.district),
    latitude: asNullableNumber(fields.latitude),
    longitude: asNullableNumber(fields.longitude),
    phone: asNullableString(fields.phone),
    website_url: asNullableString(fields.website_url)
  });
}

async function insertStyleJoins(supabase: SupabaseClient, shopId: string, styleSlugs: string[]) {
  if (!styleSlugs.length) {
    return;
  }

  const { data: styles } = await supabase.from("ramen_styles").select("id,slug").in("slug", styleSlugs);
  const rows = (styles ?? []).map((style) => ({ shop_id: shopId, style_id: style.id, confidence: 0.7 }));
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

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
