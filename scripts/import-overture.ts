import "./load-env";

import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { scoreRamenCandidate } from "../lib/candidateConfidence";

type OverturePlace = Record<string, unknown>;

const inputPath = process.argv[2] ?? "data/overture-ramen-tw.json";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const places = loadPlaces(inputPath);
  const rows = places.map(toCandidate).filter((row) => row.name && row.confidence >= 0.18);

  await upsertCandidates(rows);

  console.log(`Imported ${rows.length} Overture candidates from ${inputPath}`);
}

function loadPlaces(filePath: string): OverturePlace[] {
  const fullPath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(fullPath, "utf8");

  if (filePath.toLocaleLowerCase().endsWith(".csv")) {
    return parseCsv(raw);
  }

  const json = JSON.parse(raw);
  if (Array.isArray(json)) {
    return json;
  }

  if (Array.isArray(json.places)) {
    return json.places;
  }

  if (Array.isArray(json.features)) {
    return json.features.map((feature: Record<string, unknown>) => ({
      ...(asRecord(feature.properties) ?? {}),
      geometry: feature.geometry
    }));
  }

  throw new Error("Unsupported Overture format. Expected JSON array, {places}, {features}, or CSV.");
}

function toCandidate(place: OverturePlace) {
  const geometry = asRecord(place.geometry);
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
  const names = asRecord(place.names);
  const categories = asRecord(place.categories);
  const address = firstAddress(place.addresses);
  const websites = asArray(place.websites);
  const phones = asArray(place.phones);
  const name = asString(names?.primary) ?? asString(place.name) ?? "";
  const latitude = typeof coordinates[1] === "number" ? coordinates[1] : null;
  const longitude = typeof coordinates[0] === "number" ? coordinates[0] : null;
  const sourceId = asString(place.id) ?? [name, latitude, longitude].filter((value) => value != null && value !== "").join(":");

  return {
    source: "overture_maps",
    source_id: sourceId || null,
    name,
    address: address.fullAddress,
    city: address.city,
    district: address.district,
    latitude,
    longitude,
    phone: firstString(phones),
    website_url: firstString(websites),
    source_payload: place,
    confidence: scoreRamenCandidate([name, categories, place.categories, place.sources]),
    status: typeof latitude === "number" && typeof longitude === "number" ? "pending" : "needs_location"
  };
}

async function upsertCandidates(candidates: ReturnType<typeof toCandidate>[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as never }
  });
  const batchSize = 500;

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const { error } = await supabase.from("candidate_shops").upsert(batch, {
      onConflict: "source,source_id",
      ignoreDuplicates: false
    });

    if (error) {
      throw error;
    }
  }
}

function firstAddress(addresses: unknown) {
  const first = asRecord(asArray(addresses)[0]);
  const freeform = asString(first?.freeform);
  const locality = asString(first?.locality);
  const region = asString(first?.region);
  const postcode = asString(first?.postcode);
  const fullAddress =
    asString(first?.full_address) ?? asString(first?.fullAddress) ?? [region, locality, freeform, postcode].filter(Boolean).join(" ");

  return {
    fullAddress: fullAddress || null,
    city: region ?? null,
    district: locality ?? null
  };
}

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string") {
      return value;
    }
    const record = asRecord(value);
    const candidate = asString(record?.value) ?? asString(record?.url) ?? asString(record?.phone);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseCsv(raw: string): OverturePlace[] {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines.shift() ?? "");

  return lines.map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, parseCsvValue(cells[index])]));
  });
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsvValue(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) && /^-?\d+(\.\d+)?$/.test(trimmed) ? numberValue : trimmed;
}
