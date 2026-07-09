import "./load-env";

import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { scoreRamenCandidate } from "../lib/candidateConfidence";

type OsmElement = {
  id: number | string;
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const inputPath = process.argv[2] ?? "data/osm-ramen-tw.json";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const rows = loadOsmElements(inputPath)
    .map(toCandidate)
    .filter((row) => row.name && row.confidence >= 0.18);

  await upsertCandidates(rows);

  console.log(`Imported ${rows.length} OSM candidates from ${inputPath}`);
}

function loadOsmElements(filePath: string): OsmElement[] {
  const fullPath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(fullPath, "utf8");
  const json = JSON.parse(raw);

  if (Array.isArray(json)) {
    return json;
  }

  if (Array.isArray(json.elements)) {
    return json.elements;
  }

  throw new Error("Unsupported OSM JSON format. Expected an array or an Overpass object with elements.");
}

function toCandidate(element: OsmElement) {
  const tags = element.tags ?? {};
  const latitude = element.lat ?? element.center?.lat ?? null;
  const longitude = element.lon ?? element.center?.lon ?? null;
  const name = tags.name ?? tags["name:zh"] ?? tags["name:en"] ?? "";
  const sourceId = `${element.type ?? "node"}/${element.id}`;
  const address =
    tags["addr:full"] ??
    [tags["addr:city"], tags["addr:district"], tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join("");

  return {
    source: "openstreetmap",
    source_id: sourceId,
    name,
    address: address || null,
    city: tags["addr:city"] ?? null,
    district: tags["addr:district"] ?? null,
    latitude,
    longitude,
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    website_url: tags.website ?? tags["contact:website"] ?? null,
    source_payload: element,
    confidence: scoreRamenCandidate([name, tags.cuisine, tags.amenity, tags]),
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
