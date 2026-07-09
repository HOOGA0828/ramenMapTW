import { demoShops, demoStyles } from "./demoData";
import { createAnonServerSupabaseClient } from "./supabaseServer";
import type { RamenStyle, Shop } from "./types";

type ShopRow = Omit<Shop, "styles"> & {
  styles?: {
    confidence: number;
    ramen_styles: RamenStyle | RamenStyle[] | null;
  }[];
};

export async function getPublicMapData(): Promise<{ shops: Shop[]; styles: RamenStyle[]; usingDemoData: boolean }> {
  const supabase = createAnonServerSupabaseClient();

  if (!supabase) {
    return { shops: demoShops, styles: demoStyles, usingDemoData: true };
  }

  const [shopsResult, stylesResult] = await Promise.all([
    supabase
      .from("shops")
      .select(
        "id,name,slug,address,city,district,latitude,longitude,phone,website_url,instagram_url,facebook_url,google_maps_url,status,description,source,source_id,created_at,updated_at,styles:shop_styles(confidence,ramen_styles(id,name,slug,description))"
      )
      .neq("status", "permanently_closed")
      .order("name"),
    supabase.from("ramen_styles").select("id,name,slug,description").order("name")
  ]);

  if (shopsResult.error || stylesResult.error) {
    console.error("Failed to load Supabase map data", shopsResult.error ?? stylesResult.error);
    return { shops: demoShops, styles: demoStyles, usingDemoData: true };
  }

  const shops = ((shopsResult.data ?? []) as unknown as ShopRow[]).map((shop) => ({
    ...shop,
    styles: (shop.styles ?? []).flatMap((join) => {
      if (!join.ramen_styles) {
        return [];
      }
      return Array.isArray(join.ramen_styles) ? join.ramen_styles : [join.ramen_styles];
    })
  }));

  return {
    shops,
    styles: (stylesResult.data ?? []) as RamenStyle[],
    usingDemoData: false
  };
}
