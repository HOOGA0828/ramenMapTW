import fs from "node:fs";
import path from "node:path";

const outputPath = process.argv[2] ?? "data/osm-ramen-tw.json";
const overpassUrl = process.env.OVERPASS_API_URL ?? "https://overpass-api.de/api/interpreter";

const query = `
[out:json][timeout:180];
area["ISO3166-1"="TW"][admin_level=2]->.tw;
(
  nwr(area.tw)["cuisine"~"ramen",i];
  nwr(area.tw)["name"~"拉麵|ramen|ラーメン|らーめん|麵屋|麺屋|中華そば|製麵|麵所",i];
  nwr(area.tw)["name:zh"~"拉麵|麵屋|製麵|麵所",i];
  nwr(area.tw)["name:en"~"ramen",i];
  nwr(area.tw)["name:ja"~"ラーメン|らーめん|麺屋|中華そば",i];
);
out center tags;
`;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const response = await fetch(overpassUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "taiwan-ramen-map/0.1 contact: local-development"
    },
    body: new URLSearchParams({ data: query })
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const json = await response.json();
  const fullPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");

  console.log(`Saved ${json.elements?.length ?? 0} OSM elements to ${outputPath}`);
}
