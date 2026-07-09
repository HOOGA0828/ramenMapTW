import "./load-env";

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

type Action = "hide" | "delete";

type CliOptions = {
  action: Action;
  dryRun: boolean;
  limit: number;
};

type ShopRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
};

const TAIWAN_BOUNDS = {
  minLng: 118.0,
  maxLng: 123.8,
  minLat: 20.3,
  maxLat: 26.6
};

const TAIWAN_ADDRESS_TOKENS = [
  "台灣",
  "臺灣",
  "台北",
  "臺北",
  "新北",
  "桃園",
  "新竹",
  "苗栗",
  "台中",
  "臺中",
  "彰化",
  "南投",
  "雲林",
  "嘉義",
  "台南",
  "臺南",
  "高雄",
  "屏東",
  "宜蘭",
  "花蓮",
  "台東",
  "臺東",
  "澎湖",
  "金門",
  "連江",
  "基隆",
  "竹北",
  "斗六",
  "馬公",
  "taiwan",
  "taipei",
  "new taipei",
  "taoyuan",
  "hsinchu",
  "miaoli",
  "taichung",
  "changhua",
  "nantou",
  "yunlin",
  "chiayi",
  "tainan",
  "kaohsiung",
  "pingtung",
  "yilan",
  "hualien",
  "taitung",
  "penghu",
  "kinmen",
  "lienchiang",
  "keelung"
];

const NON_TAIWAN_ADDRESS_TOKENS = [
  "日本",
  "香港",
  "澳門",
  "中國",
  "韩国",
  "韓國",
  "japan",
  "hong kong",
  "macau",
  "china",
  "korea",
  "singapore",
  "malaysia",
  "thailand"
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("shops")
    .select("id,name,address,city,district,latitude,longitude,status")
    .neq("status", "permanently_closed")
    .order("created_at", { ascending: true })
    .limit(options.limit);

  if (error) {
    throw error;
  }

  const shops = (data ?? []) as ShopRow[];
  const invalidShops = shops
    .map((shop) => ({ shop, reason: getInvalidReason(shop) }))
    .filter((item): item is { shop: ShopRow; reason: string } => Boolean(item.reason));

  console.log(`Scanned ${shops.length} visible shops. invalid=${invalidShops.length} action=${options.action} dryRun=${options.dryRun}`);

  for (const { shop, reason } of invalidShops) {
    console.log(`- ${shop.name} (${shop.id}) - ${reason}`);
    console.log(`  address=${shop.address ?? "(empty)"} city=${shop.city ?? "(empty)"} district=${shop.district ?? "(empty)"}`);
    console.log(`  location=${formatLocation(shop)}`);
  }

  if (!invalidShops.length || options.dryRun) {
    console.log("No database changes were made.");
    return;
  }

  const ids = invalidShops.map(({ shop }) => shop.id);

  if (options.action === "delete") {
    const { error: deleteError } = await supabase.from("shops").delete().in("id", ids);
    if (deleteError) {
      throw deleteError;
    }
    console.log(`Deleted ${ids.length} shops.`);
    return;
  }

  const { error: updateError } = await supabase.from("shops").update({ status: "permanently_closed" }).in("id", ids);
  if (updateError) {
    throw updateError;
  }
  console.log(`Hidden ${ids.length} shops by setting status=permanently_closed.`);
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

  const actionValue = getValue("action") ?? "hide";
  const action: Action = actionValue === "delete" ? "delete" : "hide";
  const limit = Number(getValue("limit") ?? 5000);

  return {
    action,
    dryRun: args.includes("--dry-run"),
    limit: Number.isFinite(limit) && limit > 0 ? limit : 5000
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

function getInvalidReason(shop: ShopRow) {
  const address = normalizeText(shop.address);
  if (!address) {
    return "missing address";
  }

  if (hasCoordinates(shop) && !isInsideTaiwan(shop.latitude, shop.longitude)) {
    return "coordinates are outside Taiwan";
  }

  if (containsAny(address, NON_TAIWAN_ADDRESS_TOKENS)) {
    return "address contains a non-Taiwan location";
  }

  if (hasCoordinates(shop) && isInsideTaiwan(shop.latitude, shop.longitude)) {
    return null;
  }

  const placeText = normalizeText([shop.address, shop.city, shop.district].filter(Boolean).join(" "));
  if (!containsAny(placeText, TAIWAN_ADDRESS_TOKENS)) {
    return "address does not look like Taiwan";
  }

  return null;
}

function normalizeText(value: string | null) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function containsAny(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token.toLocaleLowerCase()));
}

function hasCoordinates(shop: ShopRow) {
  return typeof shop.latitude === "number" && typeof shop.longitude === "number";
}

function isInsideTaiwan(latitude: number | null, longitude: number | null) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return false;
  }

  return (
    latitude >= TAIWAN_BOUNDS.minLat &&
    latitude <= TAIWAN_BOUNDS.maxLat &&
    longitude >= TAIWAN_BOUNDS.minLng &&
    longitude <= TAIWAN_BOUNDS.maxLng
  );
}

function formatLocation(shop: ShopRow) {
  return hasCoordinates(shop) ? `${shop.latitude}, ${shop.longitude}` : "(empty)";
}
