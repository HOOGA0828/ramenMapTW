import { NextRequest, NextResponse } from "next/server";

import { isGoogleMapsUrl, resolveGoogleMapsPlaceInfo } from "@/lib/googleMapsPlace";
import { createServiceSupabaseClient } from "@/lib/supabaseServer";

type SubmitBody = {
  google_maps_url?: unknown;
  suggested_styles?: unknown;
};

const PLACEHOLDER_SUBMISSION_NAME = "Google Maps submission pending parse";

export async function POST(request: NextRequest) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "投稿服務尚未設定完成。" }, { status: 500 });
  }

  const body = (await request.json()) as SubmitBody;
  const googleMapsUrl = typeof body.google_maps_url === "string" ? body.google_maps_url.trim() : "";
  if (!googleMapsUrl || !isGoogleMapsUrl(googleMapsUrl)) {
    return NextResponse.json({ error: "請貼上 Google Maps 店家資訊連結。" }, { status: 400 });
  }

  const suggestedStyles = Array.isArray(body.suggested_styles)
    ? body.suggested_styles.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim())
    : [];

  const info = await resolveGoogleMapsPlaceInfo(googleMapsUrl);
  const row = {
    name: info?.name ?? PLACEHOLDER_SUBMISSION_NAME,
    address: info?.address ?? null,
    latitude: info?.latitude ?? null,
    longitude: info?.longitude ?? null,
    phone: null,
    website_url: null,
    google_maps_url: googleMapsUrl,
    instagram_url: null,
    facebook_url: null,
    suggested_styles: suggestedStyles,
    submitter_note: null,
    submitter_email: null,
    status: "pending"
  };

  const inserted = await supabase.from("shop_submissions").insert(row).select("id").single();
  if (!inserted.error) {
    return NextResponse.json({ id: inserted.data.id });
  }

  if (isMissingGoogleMapsUrlColumn(inserted.error)) {
    const fallback = await supabase
      .from("shop_submissions")
      .insert({ ...row, google_maps_url: undefined, website_url: googleMapsUrl })
      .select("id")
      .single();

    if (!fallback.error) {
      return NextResponse.json({ id: fallback.data.id, warning: "google_maps_url column is missing; stored link in website_url." });
    }

    return NextResponse.json({ error: fallback.error.message }, { status: 500 });
  }

  return NextResponse.json({ error: inserted.error.message }, { status: 500 });
}

function isMissingGoogleMapsUrlColumn(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  return error.code === "PGRST204" || /google_maps_url/i.test(message);
}
