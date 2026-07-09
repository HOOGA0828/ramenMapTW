import Link from "next/link";

import { RamenMapExplorer } from "@/components/home/RamenMapExplorer";
import { getMapStyle } from "@/lib/mapStyle";
import { getPublicMapData } from "@/lib/shopQueries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { shops, usingDemoData } = await getPublicMapData();

  return (
    <main className="app-shell">
      <header className="top-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">拉</span>
          <span>台灣拉麵地圖</span>
        </Link>
        <nav className="nav-links home-nav-links" aria-label="主要導覽">
          <Link className="home-submit-link" href="/submit">
            投稿店家
          </Link>
        </nav>
      </header>
      {usingDemoData ? (
        <div className="demo-banner">目前使用開發範例資料。設定 Supabase 環境變數後會讀取公開 shops。</div>
      ) : null}
      <RamenMapExplorer shops={shops} mapStyle={getMapStyle()} />
    </main>
  );
}
