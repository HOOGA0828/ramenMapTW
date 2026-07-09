export type GoogleMapsPlaceInfo = {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  expandedUrl: string | null;
  searchQuery: string | null;
};

type ResolveOptions = {
  geocodingApiKey?: string | null;
  timeoutMs?: number;
};

const GOOGLE_MAPS_URL_PATTERN = /(?:google\.[^/\s]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page\/)/i;
const DEFAULT_TIMEOUT_MS = 5000;

export function isGoogleMapsUrl(value: string) {
  return GOOGLE_MAPS_URL_PATTERN.test(value.trim());
}

export async function resolveGoogleMapsPlaceInfo(value: string, options: ResolveOptions = {}): Promise<GoogleMapsPlaceInfo | null> {
  const trimmed = value.trim();
  if (!trimmed || !isGoogleMapsUrl(trimmed)) {
    return null;
  }

  const direct = parseGoogleMapsPlaceInfo(trimmed);
  const expandedUrl = isShortGoogleMapsUrl(trimmed) ? await expandGoogleMapsUrl(trimmed, options.timeoutMs ?? DEFAULT_TIMEOUT_MS) : null;
  const expanded = expandedUrl ? parseGoogleMapsPlaceInfo(expandedUrl) : null;
  let info = mergePlaceInfo(direct, expanded);

  if (options.geocodingApiKey && info?.latitude != null && info.longitude != null && !info.address) {
    const address = await reverseGeocode(info.latitude, info.longitude, options.geocodingApiKey, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (address) {
      info = { ...info, address };
    }
  }

  return info;
}

export function parseGoogleMapsPlaceInfo(value: string): GoogleMapsPlaceInfo | null {
  const trimmed = value.trim();
  if (!trimmed || !isGoogleMapsUrl(trimmed)) {
    return null;
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const coordinates = parseCoordinates(trimmed, parsed);
  const searchQuery = parseSearchQuery(parsed);
  const pathName = parsePathPlaceName(parsed);
  const name = cleanPlaceName(pathName ?? searchQuery);

  return {
    name,
    address: null,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    googleMapsUrl: trimmed,
    expandedUrl: null,
    searchQuery: cleanPlaceName(searchQuery)
  };
}

function mergePlaceInfo(primary: GoogleMapsPlaceInfo | null, fallback: GoogleMapsPlaceInfo | null): GoogleMapsPlaceInfo | null {
  if (!primary && !fallback) {
    return null;
  }

  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  return {
    name: fallback.name ?? primary.name,
    address: fallback.address ?? primary.address,
    latitude: fallback.latitude ?? primary.latitude,
    longitude: fallback.longitude ?? primary.longitude,
    googleMapsUrl: primary.googleMapsUrl,
    expandedUrl: fallback.googleMapsUrl,
    searchQuery: fallback.searchQuery ?? primary.searchQuery
  };
}

async function expandGoogleMapsUrl(value: string, timeoutMs: number) {
  try {
    const response = await fetch(value, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs)
    });
    return response.url && response.url !== value ? response.url : null;
  } catch {
    return null;
  }
}

async function reverseGeocode(latitude: number, longitude: number, apiKey: string, timeoutMs: number) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "zh-TW");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as { status?: string; results?: { formatted_address?: string }[] };
    return json.status === "OK" ? (json.results?.[0]?.formatted_address ?? null) : null;
  } catch {
    return null;
  }
}

function parseCoordinates(value: string, parsed: URL) {
  const decoded = safeDecode(value);
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/
  ];

  for (const source of [value, decoded]) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) {
        continue;
      }

      const coordinates = toCoordinates(match[1], match[2]);
      if (coordinates) {
        return coordinates;
      }
    }
  }

  for (const key of ["q", "query", "ll", "center"]) {
    const coordinates = parseLatLng(parsed.searchParams.get(key));
    if (coordinates) {
      return coordinates;
    }
  }

  return null;
}

function parseSearchQuery(parsed: URL) {
  return parsed.searchParams.get("query") || parsed.searchParams.get("q") || null;
}

function parsePathPlaceName(parsed: URL) {
  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => safeDecode(segment.replaceAll("+", " ")));

  for (const marker of ["place", "search"]) {
    const index = segments.findIndex((segment) => segment.toLowerCase() === marker);
    if (index >= 0 && segments[index + 1]) {
      return segments[index + 1];
    }
  }

  return null;
}

function cleanPlaceName(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || parseLatLng(trimmed) || /^data=/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function parseLatLng(value: string | null) {
  const match = value?.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  return match ? toCoordinates(match[1], match[2]) : null;
}

function toCoordinates(latitudeValue: string, longitudeValue: string) {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

function isValidCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function isShortGoogleMapsUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "maps.app.goo.gl" || hostname === "goo.gl" || hostname === "g.page";
  } catch {
    return false;
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
