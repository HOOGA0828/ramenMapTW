import type { RamenStyle, Shop } from "./types";

export const demoStyles: RamenStyle[] = [
  { id: "demo-tonkotsu", name: "豚骨系", slug: "tonkotsu", description: null },
  { id: "demo-shoyu", name: "醬油系", slug: "shoyu", description: null },
  { id: "demo-tsukemen", name: "沾麵", slug: "tsukemen", description: null }
];

export const demoShops: Shop[] = [
  {
    id: "demo-1",
    name: "範例拉麵 台北站前店",
    slug: "demo-taipei-ramen",
    address: "台北市中正區忠孝西路一段",
    city: "台北市",
    district: "中正區",
    latitude: 25.0463,
    longitude: 121.5175,
    phone: null,
    website_url: null,
    instagram_url: null,
    facebook_url: null,
    google_maps_url: null,
    status: "open",
    description: "未設定 Supabase 時顯示的開發用範例資料。",
    source: "demo",
    source_id: "demo-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    styles: [demoStyles[0], demoStyles[1]]
  },
  {
    id: "demo-2",
    name: "範例沾麵 台中店",
    slug: "demo-taichung-tsukemen",
    address: "台中市西區公益路",
    city: "台中市",
    district: "西區",
    latitude: 24.1519,
    longitude: 120.6637,
    phone: null,
    website_url: null,
    instagram_url: null,
    facebook_url: null,
    google_maps_url: null,
    status: "open",
    description: "連上 Supabase 後會改讀正式 shops 資料。",
    source: "demo",
    source_id: "demo-2",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    styles: [demoStyles[2]]
  }
];
