import "./load-env";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

type TableName = "shops" | "candidate_shops" | "shop_submissions";

type LocationTarget = {
  table: TableName;
  id: string;
  name: string;
  status?: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
};

type GeocodeResult = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  reason?: string;
};

type CliOptions = {
  delayMs: number;
  dryRun: boolean;
  limit: number;
  tables: TableName[];
};

const DEFAULT_DELAY_MS = 10_000;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const supabase = createSupabaseClient();
  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null;
  const targets = await loadTargets(supabase, options);
  let updated = 0;
  let skipped = 0;

  console.log(
    `Found ${targets.length} location targets. delay=${options.delayMs}ms dryRun=${options.dryRun} geocodingApiKey=${apiKey ? "loaded" : "missing"}`
  );

  for (const [index, target] of targets.entries()) {
    const result = await resolveLocation(target, apiKey);

    if (!result.latitude && !result.longitude && !result.address) {
      skipped += 1;
      console.log(`[${index + 1}/${targets.length}] skipped ${target.table}:${target.id} ${target.name} - ${result.reason ?? "no result"}`);
      await sleep(options.delayMs);
      continue;
    }

    const patch = buildPatch(target, result);
    if (!Object.keys(patch).length) {
      skipped += 1;
      console.log(`[${index + 1}/${targets.length}] unchanged ${target.table}:${target.id} ${target.name} - no missing fields to update`);
      await sleep(options.delayMs);
      continue;
    }

    console.log(`[${index + 1}/${targets.length}] ${options.dryRun ? "would update" : "updating"} ${target.table}:${target.id} ${target.name}`, patch);

    if (!options.dryRun) {
      const { error } = await supabase.from(target.table).update(patch).eq("id", target.id);
      if (error) {
        throw error;
      }
    }

    updated += 1;
    await sleep(options.delayMs);
  }

  console.log(`Done. updated=${updated} skipped=${skipped}`);
}

function parseOptions(args: string[]): CliOptions {
  const getValue = (name: string) => {
    const prefix = `--${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) {
      return inline.slice(prefix.length);
    }

    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const delayMs = Number(getValue("delay-ms") ?? process.env.GOOGLE_LOCATION_DELAY_MS ?? DEFAULT_DELAY_MS);
  const limit = Number(getValue("limit") ?? 200);
  const tables = (getValue("tables") ?? "shops,candidate_shops,shop_submissions")
    .split(",")
    .map((table) => table.trim())
    .filter(isTableName);

  return {
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : DEFAULT_DELAY_MS,
    dryRun: args.includes("--dry-run"),
    limit: Number.isFinite(limit) && limit > 0 ? limit : 200,
    tables: tables.length ? tables : ["shops", "candidate_shops", "shop_submissions"]
  };
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as never }
  });
}

async function loadTargets(supabase: SupabaseClient, options: CliOptions) {
  const targets: LocationTarget[] = [];
  const perTableLimit = Math.max(1, Math.ceil(options.limit / options.tables.length));

  if (options.tables.includes("shops")) {
    const { data, error } = await supabase
      .from("shops")
      .select("id,name,address,latitude,longitude,google_maps_url,website_url,status")
      .or("address.is.null,latitude.is.null,longitude.is.null")
      .order("created_at", { ascending: true })
      .limit(perTableLimit);

    if (error) {
      throw error;
    }

    targets.push(
      ...((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
        const googleMapsUrl = asString(row.google_maps_url) ?? googleMapsUrlFromUnknown(row.website_url);
        return googleMapsUrl
          ? [
              {
                table: "shops" as const,
                id: String(row.id),
                name: String(row.name ?? ""),
                status: asString(row.status),
                address: asString(row.address),
                latitude: asNumber(row.latitude),
                longitude: asNumber(row.longitude),
                googleMapsUrl
              }
            ]
          : [];
      })
    );
  }

  if (options.tables.includes("candidate_shops")) {
    const { data, error } = await supabase
      .from("candidate_shops")
      .select("id,name,address,latitude,longitude,website_url,status,source_payload")
      .or("address.is.null,latitude.is.null,longitude.is.null,status.eq.needs_location")
      .order("created_at", { ascending: true })
      .limit(perTableLimit);

    if (error) {
      throw error;
    }

    targets.push(
      ...((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
        const googleMapsUrl = googleMapsUrlFromUnknown(row.website_url) ?? findGoogleMapsUrl(row.source_payload);
        return googleMapsUrl
          ? [
              {
                table: "candidate_shops" as const,
                id: String(row.id),
                name: String(row.name ?? ""),
                status: asString(row.status),
                address: asString(row.address),
                latitude: asNumber(row.latitude),
                longitude: asNumber(row.longitude),
                googleMapsUrl
              }
            ]
          : [];
      })
    );
  }

  if (options.tables.includes("shop_submissions")) {
    const { data, error } = await supabase
      .from("shop_submissions")
      .select("id,name,address,latitude,longitude,google_maps_url,website_url,status")
      .or("address.is.null,latitude.is.null,longitude.is.null")
      .order("created_at", { ascending: true })
      .limit(perTableLimit);

    if (error) {
      throw error;
    }

    targets.push(
      ...((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
        const googleMapsUrl = asString(row.google_maps_url) ?? googleMapsUrlFromUnknown(row.website_url);
        return googleMapsUrl
          ? [
              {
                table: "shop_submissions" as const,
                id: String(row.id),
                name: String(row.name ?? ""),
                status: asString(row.status),
                address: asString(row.address),
                latitude: asNumber(row.latitude),
                longitude: asNumber(row.longitude),
                googleMapsUrl
              }
            ]
          : [];
      })
    );
  }

  return targets.slice(0, options.limit);
}

async function resolveLocation(target: LocationTarget, apiKey: string | null): Promise<GeocodeResult> {
  const coordinates = target.googleMapsUrl ? parseCoordinates(target.googleMapsUrl) : null;
  if (coordinates) {
    const reverse = apiKey && !target.address ? await reverseGeocode(coordinates.latitude, coordinates.longitude, apiKey) : null;
    return {
      address: reverse?.address ?? target.address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    };
  }

  if (!apiKey) {
    return {
      address: null,
      latitude: null,
      longitude: null,
      reason: "Google Maps URL has no coordinates and GOOGLE_MAPS_GEOCODING_API_KEY/GOOGLE_MAPS_API_KEY is not set"
    };
  }

  const query = (target.googleMapsUrl ? parseSearchQuery(target.googleMapsUrl) : null) || [target.name, target.address].filter(Boolean).join(" ");
  if (!query) {
    return { address: null, latitude: null, longitude: null, reason: "Google Maps URL has no coordinates and no search query could be parsed" };
  }

  return geocode(query, apiKey);
}

function buildPatch(target: LocationTarget, result: GeocodeResult) {
  const patch: Record<string, unknown> = {};

  if (!target.address && result.address) {
    patch.address = result.address;
  }

  if (target.latitude == null && result.latitude != null) {
    patch.latitude = result.latitude;
  }

  if (target.longitude == null && result.longitude != null) {
    patch.longitude = result.longitude;
  }

  if (target.table === "candidate_shops" && target.status === "needs_location" && ("latitude" in patch || "longitude" in patch)) {
    patch.status = "pending";
  }

  return patch;
}

async function geocode(query: string, apiKey: string): Promise<GeocodeResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("region", "tw");
  url.searchParams.set("language", "zh-TW");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: { formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }[];
  };

  if (json.status !== "OK" || !json.results?.[0]) {
    return {
      address: null,
      latitude: null,
      longitude: null,
      reason: `Geocoding API returned ${json.status ?? "UNKNOWN"}${json.error_message ? `: ${json.error_message}` : ""}`
    };
  }

  const first = json.results[0];
  return {
    address: first.formatted_address ?? null,
    latitude: typeof first.geometry?.location?.lat === "number" ? first.geometry.location.lat : null,
    longitude: typeof first.geometry?.location?.lng === "number" ? first.geometry.location.lng : null
  };
}

async function reverseGeocode(latitude: number, longitude: number, apiKey: string): Promise<GeocodeResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "zh-TW");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reverse geocoding failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { status?: string; results?: { formatted_address?: string }[] };
  if (json.status !== "OK" || !json.results?.[0]) {
    return null;
  }

  return { address: json.results[0].formatted_address ?? null, latitude, longitude };
}

function parseCoordinates(value: string) {
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) {
      continue;
    }

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (isValidCoordinate(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function parseSearchQuery(value: string) {
  try {
    const url = new URL(value);
    const paramQuery = url.searchParams.get("query") || url.searchParams.get("q");
    if (paramQuery) {
      return paramQuery;
    }

    const placeMatch = url.pathname.match(/\/(?:place|search)\/([^/]+)/);
    return placeMatch ? decodeURIComponent(placeMatch[1].replaceAll("+", " ")) : null;
  } catch {
    return null;
  }
}

function findGoogleMapsUrl(value: unknown, depth = 0): string | null {
  if (depth > 4) {
    return null;
  }

  const direct = googleMapsUrlFromUnknown(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGoogleMapsUrl(item, depth + 1);
      if (found) {
        return found;
      }
    }
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = findGoogleMapsUrl(item, depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function googleMapsUrlFromUnknown(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return /(?:google\.[^/\s]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isValidCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function isTableName(value: string): value is TableName {
  return value === "shops" || value === "candidate_shops" || value === "shop_submissions";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
