import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminAuth";

const CLOSE_DISTANCE_METERS = 150;

type ShopRow = {
  id: string;
  name: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
};

type DuplicatePair = {
  keepId: string;
  removeId: string;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    return admin.error;
  }

  const { data, error } = await admin.supabase
    .from("shops")
    .select("id,name,city,district,latitude,longitude,created_at")
    .neq("status", "permanently_closed")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const duplicatePairs = findDuplicateShops((data ?? []) as ShopRow[]);
  const removeIds = Array.from(new Set(duplicatePairs.map((pair) => pair.removeId)));

  if (!removeIds.length) {
    return NextResponse.json({ deleted: 0, duplicate_pairs: [] });
  }

  const { error: deleteError } = await admin.supabase.from("shops").delete().in("id", removeIds);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({
    deleted: removeIds.length,
    duplicate_pairs: duplicatePairs
  });
}

function findDuplicateShops(shops: ShopRow[]) {
  const groups = new Map<string, ShopRow[]>();

  for (const shop of shops) {
    if (
      !shop.name ||
      typeof shop.latitude !== "number" ||
      typeof shop.longitude !== "number" ||
      !Number.isFinite(shop.latitude) ||
      !Number.isFinite(shop.longitude)
    ) {
      continue;
    }

    const key = [normalizeText(shop.name), normalizeText(shop.city), normalizeText(shop.district)].join("|");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(shop);
  }

  const duplicates: DuplicatePair[] = [];

  for (const group of groups.values()) {
    const keepers: ShopRow[] = [];
    const sorted = group.sort((a, b) => getTime(a.created_at) - getTime(b.created_at));

    for (const shop of sorted) {
      const keeper = keepers.find((candidate) => distanceMeters(candidate, shop) <= CLOSE_DISTANCE_METERS);
      if (keeper) {
        duplicates.push({ keepId: keeper.id, removeId: shop.id });
      } else {
        keepers.push(shop);
      }
    }
  }

  return duplicates;
}

function normalizeText(value: string | null) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, "");
}

function getTime(value: string | null) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function distanceMeters(a: ShopRow, b: ShopRow) {
  const lat1 = degreesToRadians(a.latitude ?? 0);
  const lat2 = degreesToRadians(b.latitude ?? 0);
  const deltaLat = degreesToRadians((b.latitude ?? 0) - (a.latitude ?? 0));
  const deltaLng = degreesToRadians((b.longitude ?? 0) - (a.longitude ?? 0));
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}
