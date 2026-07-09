import Link from "next/link";

import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default function AdminPage() {
  return (
    <main className="app-shell">
      <header className="top-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">拉</span>
          <span>台灣拉麵地圖</span>
        </Link>
        <nav className="nav-links" aria-label="主要導覽">
          <Link href="/">地圖</Link>
          <Link href="/submit">投稿店家</Link>
        </nav>
      </header>
      <AdminDashboard />
    </main>
  );
}
