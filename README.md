# 台灣拉麵地圖

Next.js App Router + MapLibre GL JS + Supabase 的台灣拉麵店地圖。專案包含公開地圖、店家投稿、後台審核、OSM/Overture 匯入、Google Geocoding 補地址，以及資料清理腳本。

## 功能

- 首頁 `/`：地圖瀏覽、店家搜尋、風格篩選、店家資訊卡。
- 投稿 `/submit`：使用者提交店家資料，寫入 `shop_submissions`。
- 後台 `/admin`：審核候選店家與投稿，支援 approve / reject / duplicate / update。
- 顯示中店家管理：可取消顯示店家，或智慧刪除重複店家。
- 資料腳本：匯入 OSM / Overture、補 Google Maps 地址與座標、清掉無地址或非台灣店家。

## 環境設定

複製環境檔：

```bash
cp .env.example .env.local
```

基本必要變數：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=your-strong-admin-password
NEXT_PUBLIC_MAP_STYLE_URL=
```

Google Geocoding 補地址時才需要：

```env
GOOGLE_MAPS_GEOCODING_API_KEY=
```

`NEXT_PUBLIC_MAP_STYLE_URL` 沒設定時，專案會使用內建 OpenStreetMap raster fallback。`ADMIN_PASSWORD` 必須設定，正式環境請使用強密碼。

## Supabase 初始化

1. 建立 Supabase project。
2. 到 Supabase Dashboard 的 SQL Editor。
3. 貼上並執行 `supabase/migrations/001_initial_schema.sql`。
4. 把 Project URL、Anon key、Service role key 填到 `.env.local`。

也可以用 Supabase CLI：

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## 開發

安裝依賴：

```bash
npm install
```

啟動開發伺服器：

```bash
npm run dev
```

如果你和 Codex 要同時跑 Next，請用不同 port 與不同輸出資料夾，避免 `.next` 被鎖：

```powershell
$env:NEXT_DIST_DIR='.next-codex-dev'; npm run dev -- -p 3001
```

Production build 也可以隔離輸出：

```powershell
$env:NEXT_DIST_DIR='.next-codex-build'; npm run build
```

## 驗證

型別檢查：

```bash
npm run typecheck
```

正式 build：

```bash
npm run build
```

## Vercel 部署

1. 先確認 GitHub repository 已有最新 `main` 分支。
2. 到 Vercel 新增 Project，Import `HOOGA0828/ramenMapTW`。
3. Framework Preset 選 Next.js；Build Command 使用預設 `npm run build`，Install Command 使用預設 `npm install`。
4. 在 Vercel Project Settings -> Environment Variables 設定：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
NEXT_PUBLIC_MAP_STYLE_URL=
```

`GOOGLE_MAPS_GEOCODING_API_KEY` 只給本機資料補齊腳本使用；若未在 Vercel 上執行相關腳本，可以不用設定。設定完環境變數後重新 Deploy。

## OSM 資料

從 Overpass API 抓台灣拉麵候選資料：

```bash
npm run fetch:osm
```

預設輸出：

```txt
data/osm-ramen-tw.json
```

匯入 Supabase 的 `candidate_shops`：

```bash
npm run import:osm
```

指定檔案：

```bash
npm run import:osm -- data/my-osm.json
```

匯入會依 `source, source_id` upsert，不會重複建立相同來源資料。

## Overture Maps 資料

支援 JSON array、`{ "places": [] }`、GeoJSON-like `{ "features": [] }`，以及 CSV。

預設檔案：

```txt
data/overture-ramen-tw.json
```

匯入：

```bash
npm run import:overture
```

指定檔案：

```bash
npm run import:overture -- data/my-overture.csv
```

## Google Maps 慢速補地址與座標

腳本：`scripts/fill-google-map-locations.ts`

用途：

- 找出缺地址、缺緯度或缺經度的資料。
- 只處理有 Google Maps URL 的資料。
- 優先從 URL 解析座標，例如 `@25.0,121.5` 或 `!3d25.0!4d121.5`。
- URL 沒有座標時，使用 Google Geocoding API 查詢。
- 每筆預設等待 10 秒，避免短時間大量請求。

先確認 `.env.local` 有：

```env
GOOGLE_MAPS_GEOCODING_API_KEY=your_key
```

Dry-run 預覽：

```bash
npm run fill:google-locations -- --dry-run --limit=20 --delay-ms=10000
```

正式更新：

```bash
npm run fill:google-locations -- --limit=20 --delay-ms=10000
```

只補正式店家：

```bash
npm run fill:google-locations -- --tables=shops --limit=50 --delay-ms=30000
```

可用參數：

- `--dry-run`：只列出會做什麼，不寫入資料庫。
- `--limit=20`：最多處理幾筆。
- `--delay-ms=10000`：每筆間隔毫秒數。
- `--tables=shops,candidate_shops,shop_submissions`：指定處理資料表。

輸出中的 `skipped` 會附原因，例如 API key 沒載入、URL 沒座標、Geocoding API 沒查到結果。

## 清理無地址或非台灣店家

腳本：`scripts/clean-shops-data.ts`

用途：

- 找出沒有地址的 `shops`。
- 找出地址不像台灣、且座標也不在台灣範圍內的 `shops`。
- 預設正式執行時會把店家設成 `permanently_closed`，讓前台不再顯示，但不刪資料。
- 若明確指定 `--action=delete` 才會刪除資料。

強烈建議先 dry-run：

```bash
npm run clean:shops -- --dry-run
```

限制檢查筆數：

```bash
npm run clean:shops -- --dry-run --limit=200
```

正式取消顯示不合格店家：

```bash
npm run clean:shops -- --action=hide --limit=5000
```

正式刪除不合格店家，請小心使用：

```bash
npm run clean:shops -- --action=delete --limit=5000
```

判斷規則：

- `address` 空值：不合格。
- 有座標且座標不在台灣粗略範圍內：不合格。
- 地址含明確非台灣地名，例如 Japan、Hong Kong、香港、日本：不合格。
- 有座標且座標在台灣範圍內：視為合格。
- 沒座標時，地址或城市/區域需含台灣縣市關鍵字。

## 後台審核流程

進入 `/admin`，輸入 `ADMIN_PASSWORD`。

後台分頁：

- 待審核：顯示 `pending`、`needs_location`、`needs_more_info`。
- 已審核：顯示 approved。
- 顯示中：顯示目前前台可見店家。
- 已拒絕：顯示 rejected、duplicate。

可用操作：

- `Approve`：建立正式 `shops` 資料。
- `Reject`：拒絕候選或投稿。
- `Duplicate`：標記重複。
- `更新`：更新審核欄位。
- `取消顯示`：將正式店家狀態設為 `permanently_closed`。
- `智慧刪除重複店家`：同店名、同區域、150 公尺內視為重複，保留最早建立的一筆。

## 地圖 marker 行為

- 地圖 zoom 小於 10 時不顯示 marker，避免台灣全圖視角過度擁擠。
- 縮放開始時會先移除 marker。
- 縮放結束後，如果 zoom 大於等於 10，會重新建立 marker，讓定位重新對齊。
- 點擊左側店家列表仍會顯示右下角店家資訊卡。

## 注意事項

- `SUPABASE_SERVICE_ROLE_KEY` 權限很高，不要放到前端公開環境。
- `GOOGLE_MAPS_GEOCODING_API_KEY` 建議限制只能使用 Geocoding API。
- 大量補資料前先使用 `--dry-run`。
- 大量資料更新建議用小 `--limit` 分批跑。
