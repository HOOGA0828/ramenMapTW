import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/adminAuth";
import { isGoogleMapsUrl, resolveGoogleMapsPlaceInfo } from "@/lib/googleMapsPlace";

type SubmissionRow = Record<string, unknown> & {
  id: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  website_url?: string | null;
  status: string | null;
};

const PLACEHOLDER_SUBMISSION_NAMES = new Set(["Google Maps submission pending parse", "Google Maps 投稿待解析", "待解析 Google Maps 投稿"]);

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const [candidates, submissions, shops, styles] = await Promise.all([
    admin.supabase.from("candidate_shops").select("*").order("created_at", { ascending: false }).limit(500),
    admin.supabase.from("shop_submissions").select("*").order("created_at", { ascending: false }).limit(500),
    admin.supabase
      .from("shops")
      .select(
        "id,name,slug,address,city,district,latitude,longitude,phone,website_url,instagram_url,facebook_url,google_maps_url,status,description,source,source_id,created_at,updated_at,styles:shop_styles(confidence,ramen_styles(id,name,slug,description))"
      )
      .order("created_at", { ascending: false })
      .limit(500),
    admin.supabase.from("ramen_styles").select("id,name,slug,description").order("name")
  ]);

  const error = candidates.error ?? submissions.error ?? shops.error ?? styles.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enrichedSubmissions = await enrichGoogleMapsSubmissions(admin.supabase, (submissions.data ?? []) as SubmissionRow[]);

  return NextResponse.json({
    candidates: candidates.data ?? [],
    submissions: enrichedSubmissions,
    shops: normalizeShops(shops.data ?? []),
    styles: styles.data ?? []
  });
}

async function enrichGoogleMapsSubmissions(supabase: SupabaseClient, submissions: SubmissionRow[]) {
  return Promise.all(
    submissions.map(async (submission) => {
      const googleMapsUrl = asString(submission.google_maps_url) ?? googleMapsUrlFromFallback(submission.website_url);
      if (!googleMapsUrl || !needsGoogleMapsEnrichment(submission)) {
        return submission;
      }

      const info = await resolveGoogleMapsPlaceInfo(googleMapsUrl);
      if (!info) {
        return submission;
      }

      const patch: Record<string, unknown> = {};
      if (info.name && shouldReplaceSubmissionName(submission.name)) {
        patch.name = info.name;
      }
      if (!submission.address && info.address) {
        patch.address = info.address;
      }
      if (submission.latitude == null && info.latitude != null) {
        patch.latitude = info.latitude;
      }
      if (submission.longitude == null && info.longitude != null) {
        patch.longitude = info.longitude;
      }
      if (!submission.google_maps_url) {
        patch.google_maps_url = googleMapsUrl;
      }
      if (submission.status === "needs_more_info" && (patch.name || patch.latitude || patch.longitude)) {
        patch.status = "pending";
      }

      if (!Object.keys(patch).length) {
        return submission;
      }

      const { error } = await supabase
        .from("shop_submissions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", submission.id);

      if (!error) {
        return { ...submission, ...patch };
      }

      if ("google_maps_url" in patch && isMissingGoogleMapsUrlColumn(error)) {
        const { google_maps_url: _googleMapsUrl, ...retryPatch } = patch;
        const retry = await supabase
          .from("shop_submissions")
          .update({ ...retryPatch, updated_at: new Date().toISOString() })
          .eq("id", submission.id);

        return retry.error ? { ...submission, ...patch } : { ...submission, ...patch };
      }

      return submission;
    })
  );
}

function needsGoogleMapsEnrichment(submission: SubmissionRow) {
  return (
    shouldReplaceSubmissionName(submission.name) ||
    !submission.address ||
    submission.latitude == null ||
    submission.longitude == null ||
    submission.status === "needs_more_info"
  );
}

function shouldReplaceSubmissionName(value: unknown) {
  const name = asString(value);
  return !name || PLACEHOLDER_SUBMISSION_NAMES.has(name);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function googleMapsUrlFromFallback(value: unknown) {
  const url = asString(value);
  return url && isGoogleMapsUrl(url) ? url : null;
}

function isMissingGoogleMapsUrlColumn(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  return error.code === "PGRST204" || /google_maps_url/i.test(message);
}

function normalizeShops(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const styles = Array.isArray(row.styles)
      ? row.styles.flatMap((join) => {
          const ramenStyles = (join as { ramen_styles?: unknown }).ramen_styles;
          if (!ramenStyles) {
            return [];
          }
          return Array.isArray(ramenStyles) ? ramenStyles : [ramenStyles];
        })
      : [];

    return {
      ...row,
      styles
    };
  });
}
