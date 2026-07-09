export const DEFAULT_RAMEN_STYLES = [
  { name: "豚骨系", slug: "tonkotsu", description: "豚骨、博多、久留米等濃厚系湯頭。" },
  { name: "醬油系", slug: "shoyu", description: "醬油、正油、中華そば等清爽或厚實醬油湯頭。" },
  { name: "味噌系", slug: "miso", description: "以味噌為主體的湯頭。" },
  { name: "鹽味系", slug: "shio", description: "鹽味、塩、shio 等清澈湯頭。" },
  { name: "雞白湯系", slug: "chicken-paitan", description: "雞白湯、鶏白湯、chicken paitan 等濃厚雞湯。" },
  { name: "魚介系", slug: "gyokai", description: "魚介、煮干、niboshi 等海味湯頭。" },
  { name: "沾麵", slug: "tsukemen", description: "沾麵、つけ麺、tsukemen。" },
  { name: "家系", slug: "iekei", description: "橫濱家系、iekei 風格。" },
  { name: "二郎系", slug: "jiro", description: "二郎、jiro、厚切叉燒與大量蔬菜系。" },
  { name: "其他", slug: "other", description: "尚未分類或混合派系。" }
] as const;

type StyleRule = {
  slug: (typeof DEFAULT_RAMEN_STYLES)[number]["slug"];
  keywords: string[];
};

const STYLE_RULES: StyleRule[] = [
  { slug: "tonkotsu", keywords: ["豚骨", "tonkotsu", "博多", "久留米"] },
  { slug: "shoyu", keywords: ["醬油", "正油", "shoyu", "中華そば"] },
  { slug: "miso", keywords: ["味噌", "miso"] },
  { slug: "shio", keywords: ["鹽味", "塩", "shio"] },
  { slug: "chicken-paitan", keywords: ["雞白湯", "鶏白湯", "chicken paitan"] },
  { slug: "gyokai", keywords: ["魚介", "煮干", "niboshi"] },
  { slug: "tsukemen", keywords: ["沾麵", "つけ麺", "tsukemen"] },
  { slug: "iekei", keywords: ["家系", "iekei"] },
  { slug: "jiro", keywords: ["二郎", "jiro"] }
];

export function classifyRamenStyles(input: unknown): string[] {
  const text = stringifySearchText(input).toLocaleLowerCase();
  const matches = STYLE_RULES.filter((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword.toLocaleLowerCase()))
  ).map((rule) => rule.slug);

  return Array.from(new Set(matches));
}

export function stringifySearchText(input: unknown): string {
  if (input == null) {
    return "";
  }

  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return String(input);
  }

  if (Array.isArray(input)) {
    return input.map(stringifySearchText).join(" ");
  }

  if (typeof input === "object") {
    return Object.values(input as Record<string, unknown>).map(stringifySearchText).join(" ");
  }

  return "";
}
