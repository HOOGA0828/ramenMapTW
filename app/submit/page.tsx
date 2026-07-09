import Link from "next/link";

import { SubmitShopForm } from "@/components/submit/SubmitShopForm";
import { getPublicMapData } from "@/lib/shopQueries";

export default async function SubmitPage() {
  const { styles } = await getPublicMapData();

  return (
    <main className="app-shell">
      <header className="top-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">拉</span>
          <span>台灣拉麵地圖</span>
        </Link>
        <nav className="nav-links" aria-label="主要導覽">
          <Link href="/">地圖</Link>
          <Link href="/admin">後台</Link>
        </nav>
      </header>
      <SubmitShopForm styles={styles} />
    </main>
  );
}
