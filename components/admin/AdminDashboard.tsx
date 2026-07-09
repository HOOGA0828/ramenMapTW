"use client";

import { Check, CheckCheck, EyeOff, Loader2, LogIn, RefreshCw, Save, Shield, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AdminReviewPayload, CandidateShop, Shop, ShopSubmission } from "@/lib/types";

const ADMIN_SESSION_KEY = "ramen-map-admin-password";

type DraftRecord = Record<string, string | number | null | string[]>;
type ReviewKind = "candidates" | "submissions";
type StatusTab = "pending" | "approved" | "displaying" | "rejected";
type SourceFilter = "all" | ReviewKind;
type ReviewItem = CandidateShop | ShopSubmission;

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: "pending", label: "待審核" },
  { key: "approved", label: "審核通過" },
  { key: "displaying", label: "顯示中" },
  { key: "rejected", label: "審核未通過" }
];

export function AdminDashboard() {
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [payload, setPayload] = useState<AdminReviewPayload | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [isDeduping, setIsDeduping] = useState(false);

  useEffect(() => {
    setAdminPassword(window.sessionStorage.getItem(ADMIN_SESSION_KEY));
    setLoadingSession(false);
  }, []);

  async function loadReviewData(password = adminPassword) {
    if (!password) {
      return;
    }

    setError(null);
    const response = await fetch("/api/admin/review", {
      headers: { "x-admin-password": password },
      cache: "no-store"
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error ?? "後台資料讀取失敗。");
      return;
    }
    setPayload(json);
  }

  useEffect(() => {
    if (adminPassword) {
      loadReviewData(adminPassword);
    } else {
      setPayload(null);
    }
  }, [adminPassword]);

  const grouped = useMemo(() => groupReviewPayload(payload), [payload]);
  const visibleReviewItems = useMemo(
    () => filterBySource(grouped[activeTab].reviewItems, sourceFilter),
    [activeTab, grouped, sourceFilter]
  );
  const visibleShops = grouped.displaying.shops;
  const bulkApprovableItems = filterBySource(grouped.pending.reviewItems, sourceFilter).filter((item) => {
    return canApproveReviewItem(item.kind, item.item);
  });

  function handleLogin(password: string) {
    window.sessionStorage.setItem(ADMIN_SESSION_KEY, password);
    setAdminPassword(password);
  }

  function signOut() {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAdminPassword(null);
    setPayload(null);
  }

  async function bulkApprove() {
    if (!adminPassword || !bulkApprovableItems.length) {
      return;
    }

    setIsBulkApproving(true);
    setError(null);
    setMessage(null);

    let successCount = 0;
    const failures: string[] = [];

    for (const item of bulkApprovableItems) {
      try {
        const response = await fetch(`/api/admin/${item.kind}/${item.item.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-admin-password": adminPassword
          },
          body: JSON.stringify({
            action: "approve",
            review_note: "一鍵審核通過",
            fields: toDraft(item.item)
          })
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error ?? "審核失敗");
        }
        successCount += 1;
      } catch (bulkError) {
        failures.push(`${item.item.name}: ${bulkError instanceof Error ? bulkError.message : "審核失敗"}`);
      }
    }

    setIsBulkApproving(false);
    setMessage(`一鍵審核完成，成功 ${successCount} 筆。`);
    if (failures.length) {
      setError(`有 ${failures.length} 筆失敗：${failures.slice(0, 3).join("；")}`);
    }
    await loadReviewData();
  }

  async function smartDedupe() {
    if (!adminPassword || !visibleShops.length) {
      return;
    }

    const confirmed = window.confirm("會刪除同店名、同區域且經緯度 150 公尺內的重複店家，並保留最早建立的一筆。確定要繼續嗎？");
    if (!confirmed) {
      return;
    }

    setIsDeduping(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/shops/dedupe", {
        method: "POST",
        headers: { "x-admin-password": adminPassword }
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "智慧刪除重複店家失敗");
      }
      setMessage(`已刪除 ${json.deleted ?? 0} 筆重複店家`);
      await loadReviewData();
    } catch (dedupeError) {
      setError(dedupeError instanceof Error ? dedupeError.message : "智慧刪除重複店家失敗");
    } finally {
      setIsDeduping(false);
    }
  }

  if (loadingSession) {
    return (
      <section className="admin-page">
        <div className="admin-loading">
          <Loader2 className="spin" size={18} />
          載入登入狀態
        </div>
      </section>
    );
  }

  if (!adminPassword) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <section className="admin-page">
      <div className="admin-header">
        <div>
          <p>Admin Review</p>
          <h1>店家審核後台</h1>
          <span>密碼登入模式</span>
        </div>
        <div className="admin-actions">
          {activeTab === "pending" ? (
            <button className="primary-button" type="button" disabled={!bulkApprovableItems.length || isBulkApproving} onClick={bulkApprove}>
              {isBulkApproving ? <Loader2 className="spin" size={16} /> : <CheckCheck size={16} />}
              一鍵審核 {bulkApprovableItems.length}
            </button>
          ) : null}
          {activeTab === "displaying" ? (
            <button className="danger-button" type="button" disabled={!visibleShops.length || isDeduping} onClick={smartDedupe}>
              {isDeduping ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
              智慧刪除重複店家
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={() => loadReviewData()}>
            <RefreshCw size={16} />
            重新整理
          </button>
          <button className="secondary-button" type="button" onClick={signOut}>
            登出
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      <div className="admin-tabs">
        {statusTabs.map((tab) => (
          <button className={activeTab === tab.key ? "is-active" : ""} key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}>
            {tab.label} {getTabCount(grouped, tab.key)}
          </button>
        ))}
      </div>

      {activeTab !== "displaying" ? (
        <div className="admin-segmented">
          <button className={sourceFilter === "all" ? "is-active" : ""} type="button" onClick={() => setSourceFilter("all")}>
            全部
          </button>
          <button className={sourceFilter === "submissions" ? "is-active" : ""} type="button" onClick={() => setSourceFilter("submissions")}>
            使用者投稿
          </button>
          <button className={sourceFilter === "candidates" ? "is-active" : ""} type="button" onClick={() => setSourceFilter("candidates")}>
            候選資料
          </button>
        </div>
      ) : null}

      {!payload ? (
        <div className="admin-loading">
          <Loader2 className="spin" size={18} />
          載入審核資料
        </div>
      ) : activeTab === "displaying" ? (
        <ShopList
          adminPassword={adminPassword}
          shops={visibleShops}
          onDone={(text) => {
            setMessage(text);
            loadReviewData();
          }}
          onError={setError}
        />
      ) : (
        <ReviewList
          adminPassword={adminPassword}
          items={visibleReviewItems}
          onDone={(text) => {
            setMessage(text);
            loadReviewData();
          }}
          onError={setError}
        />
      )}
    </section>
  );
}

function AdminLogin({ onLogin }: { onLogin: (password: string) => void }) {
  const [password, setPassword] = useState("");

  function submitLogin() {
    if (password.trim()) {
      onLogin(password.trim());
    }
  }

  return (
    <section className="admin-login">
      <div className="login-panel">
        <Shield size={30} />
        <h1>管理員登入</h1>
        <label className="field">
          <span>後台密碼</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitLogin();
              }
            }}
          />
        </label>
        <button className="primary-button" type="button" disabled={!password.trim()} onClick={submitLogin}>
          <LogIn size={16} />
          登入
        </button>
      </div>
    </section>
  );
}

function ReviewList({
  adminPassword,
  items,
  onDone,
  onError
}: {
  adminPassword: string;
  items: { kind: ReviewKind; item: ReviewItem }[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  if (!items.length) {
    return <div className="empty-state">目前沒有資料。</div>;
  }

  return (
    <div className="review-list">
      {items.map(({ kind, item }) => (
        <ReviewCard adminPassword={adminPassword} item={item} key={`${kind}-${item.id}`} kind={kind} onDone={onDone} onError={onError} />
      ))}
    </div>
  );
}

function ReviewCard({
  adminPassword,
  item,
  kind,
  onDone,
  onError
}: {
  adminPassword: string;
  item: ReviewItem;
  kind: ReviewKind;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const initialDraft = useMemo(() => toDraft(item), [item]);
  const [draft, setDraft] = useState<DraftRecord>(initialDraft);
  const [reviewNote, setReviewNote] = useState(item.review_note ?? "");
  const [isWorking, setIsWorking] = useState(false);
  const isCandidate = kind === "candidates";
  const canApprove = canApproveReviewItem(kind, item);

  function updateDraft(key: string, value: DraftRecord[string]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitAction(action: "approve" | "reject" | "duplicate" | "update") {
    setIsWorking(true);
    onError("");

    try {
      const response = await fetch(`/api/admin/${kind}/${item.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-password": adminPassword
        },
        body: JSON.stringify({
          action,
          review_note: reviewNote || null,
          fields: draft
        })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "審核動作失敗。");
      }
      const label =
        action === "approve"
          ? "已通過並建立公開店家"
          : action === "reject"
            ? "已拒絕"
            : action === "duplicate"
              ? "已標記重複"
              : "已儲存";
      onDone(label);
    } catch (error) {
      onError(error instanceof Error ? error.message : "審核動作失敗。");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <article className="review-card">
      <div className="review-card-head">
        <div>
          <div className="review-badges">
            <span className="status-pill">{item.status}</span>
            <span className="status-pill">{isCandidate ? "候選資料" : "使用者投稿"}</span>
          </div>
          <h2>{item.name}</h2>
          <p>{item.address || "地址待補"}</p>
        </div>
        {isCandidate ? <strong className="confidence">confidence {(item as CandidateShop).confidence}</strong> : null}
      </div>

      <div className="admin-form-grid">
        <label className="field">
          <span>店名</span>
          <input value={String(draft.name ?? "")} onChange={(event) => updateDraft("name", event.target.value)} />
        </label>
        <label className="field">
          <span>地址</span>
          <input value={String(draft.address ?? "")} onChange={(event) => updateDraft("address", event.target.value)} />
        </label>
        {isCandidate ? (
          <>
            <label className="field">
              <span>縣市</span>
              <input value={String(draft.city ?? "")} onChange={(event) => updateDraft("city", event.target.value)} />
            </label>
            <label className="field">
              <span>行政區</span>
              <input value={String(draft.district ?? "")} onChange={(event) => updateDraft("district", event.target.value)} />
            </label>
          </>
        ) : null}
        <label className="field">
          <span>Latitude</span>
          <input value={String(draft.latitude ?? "")} onChange={(event) => updateDraft("latitude", event.target.value)} />
        </label>
        <label className="field">
          <span>Longitude</span>
          <input value={String(draft.longitude ?? "")} onChange={(event) => updateDraft("longitude", event.target.value)} />
        </label>
        <label className="field">
          <span>電話</span>
          <input value={String(draft.phone ?? "")} onChange={(event) => updateDraft("phone", event.target.value)} />
        </label>
        <label className="field">
          <span>網站</span>
          <input value={String(draft.website_url ?? "")} onChange={(event) => updateDraft("website_url", event.target.value)} />
        </label>
      </div>

      {!isCandidate ? <SubmissionExtra draft={draft} updateDraft={updateDraft} /> : null}

      <label className="field">
        <span>審核備註</span>
        <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
      </label>

      <div className="review-actions">
        <button className="secondary-button" type="button" disabled={isWorking} onClick={() => submitAction("update")}>
          <Save size={15} />
          儲存
        </button>
        <button className="primary-button" type="button" disabled={isWorking || !canApprove} onClick={() => submitAction("approve")}>
          <Check size={15} />
          Approve
        </button>
        <button className="secondary-button" type="button" disabled={isWorking} onClick={() => submitAction("duplicate")}>
          Duplicate
        </button>
        <button className="danger-button" type="button" disabled={isWorking} onClick={() => submitAction("reject")}>
          <X size={15} />
          Reject
        </button>
      </div>
    </article>
  );
}

function SubmissionExtra({ draft, updateDraft }: { draft: DraftRecord; updateDraft: (key: string, value: DraftRecord[string]) => void }) {
  return (
    <div className="admin-form-grid">
      <label className="field">
        <span>Instagram</span>
        <input value={String(draft.instagram_url ?? "")} onChange={(event) => updateDraft("instagram_url", event.target.value)} />
      </label>
      <label className="field">
        <span>Facebook</span>
        <input value={String(draft.facebook_url ?? "")} onChange={(event) => updateDraft("facebook_url", event.target.value)} />
      </label>
      <label className="field">
        <span>Google Maps</span>
        <input value={String(draft.google_maps_url ?? "")} onChange={(event) => updateDraft("google_maps_url", event.target.value)} />
      </label>
      <label className="field">
        <span>投稿者 email</span>
        <input value={String(draft.submitter_email ?? "")} onChange={(event) => updateDraft("submitter_email", event.target.value)} />
      </label>
      <label className="field">
        <span>建議派系，以逗號分隔</span>
        <input
          value={Array.isArray(draft.suggested_styles) ? draft.suggested_styles.join(", ") : ""}
          onChange={(event) => setSuggestedStyles(updateDraft, event.target.value)}
        />
      </label>
      <label className="field wide">
        <span>投稿說明</span>
        <textarea value={String(draft.submitter_note ?? "")} onChange={(event) => updateDraft("submitter_note", event.target.value)} />
      </label>
    </div>
  );
}

function ShopList({
  adminPassword,
  shops,
  onDone,
  onError
}: {
  adminPassword: string;
  shops: Shop[];
  onDone: (message: string) => void;
  onError: (message: string | null) => void;
}) {
  const [workingShopId, setWorkingShopId] = useState<string | null>(null);

  async function hideShop(shop: Shop) {
    const confirmed = window.confirm(`確定要取消顯示「${shop.name}」嗎？`);
    if (!confirmed) {
      return;
    }

    setWorkingShopId(shop.id);
    onError(null);

    try {
      const response = await fetch(`/api/admin/shops/${shop.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-password": adminPassword
        },
        body: JSON.stringify({ action: "hide" })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "取消顯示店家失敗");
      }
      onDone(`已取消顯示 ${shop.name}`);
    } catch (hideError) {
      onError(hideError instanceof Error ? hideError.message : "取消顯示店家失敗");
    } finally {
      setWorkingShopId(null);
    }
  }

  async function deleteShop(shop: Shop) {
    const confirmed = window.confirm(`確定要永久刪除「${shop.name}」嗎？這個動作無法復原。`);
    if (!confirmed) {
      return;
    }

    setWorkingShopId(shop.id);
    onError(null);

    try {
      const response = await fetch(`/api/admin/shops/${shop.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-password": adminPassword
        },
        body: JSON.stringify({ action: "delete" })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "刪除店家失敗");
      }
      onDone(`已刪除 ${shop.name}`);
    } catch (deleteError) {
      onError(deleteError instanceof Error ? deleteError.message : "刪除店家失敗");
    } finally {
      setWorkingShopId(null);
    }
  }

  if (!shops.length) {
    return <div className="empty-state">目前沒有公開顯示中的店家。</div>;
  }

  return (
    <div className="review-list">
      {shops.map((shop) => (
        <article className="review-card" key={shop.id}>
          <div className="review-card-head">
            <div>
              <div className="review-badges">
                <span className="status-pill">{shop.status}</span>
                <span className="status-pill">顯示中</span>
              </div>
              <h2>{shop.name}</h2>
              <p>{shop.address || "地址待補"}</p>
            </div>
            <strong className="confidence">{shop.source || "manual"}</strong>
          </div>
          <div className="review-actions">
            <button className="danger-button" type="button" disabled={workingShopId === shop.id} onClick={() => hideShop(shop)}>
              {workingShopId === shop.id ? <Loader2 className="spin" size={15} /> : <EyeOff size={15} />}
              取消顯示
            </button>
            <button className="danger-button" type="button" disabled={workingShopId === shop.id} onClick={() => deleteShop(shop)}>
              {workingShopId === shop.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
              刪除
            </button>
          </div>
          <div className="shop-meta-grid">
            <span>縣市：{shop.city || "未填"}</span>
            <span>行政區：{shop.district || "未填"}</span>
            <span>座標：{typeof shop.latitude === "number" && typeof shop.longitude === "number" ? `${shop.latitude}, ${shop.longitude}` : "未填"}</span>
            <span>派系：{shop.styles.length ? shop.styles.map((style) => style.name).join("、") : "未分類"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function groupReviewPayload(payload: AdminReviewPayload | null) {
  const empty = {
    pending: { reviewItems: [] as { kind: ReviewKind; item: ReviewItem }[], shops: [] as Shop[] },
    approved: { reviewItems: [] as { kind: ReviewKind; item: ReviewItem }[], shops: [] as Shop[] },
    displaying: { reviewItems: [] as { kind: ReviewKind; item: ReviewItem }[], shops: [] as Shop[] },
    rejected: { reviewItems: [] as { kind: ReviewKind; item: ReviewItem }[], shops: [] as Shop[] }
  };

  if (!payload) {
    return empty;
  }

  const reviewItems = [
    ...payload.submissions.map((item) => ({ kind: "submissions" as const, item })),
    ...payload.candidates.map((item) => ({ kind: "candidates" as const, item }))
  ];

  return {
    pending: {
      reviewItems: reviewItems.filter(({ item }) => item.status === "pending" || item.status === "needs_location" || item.status === "needs_more_info"),
      shops: []
    },
    approved: {
      reviewItems: reviewItems.filter(({ item }) => item.status === "approved"),
      shops: []
    },
    displaying: {
      reviewItems: [],
      shops: payload.shops.filter((shop) => shop.status !== "permanently_closed")
    },
    rejected: {
      reviewItems: reviewItems.filter(({ item }) => item.status === "rejected" || item.status === "duplicate"),
      shops: []
    }
  };
}

function filterBySource(items: { kind: ReviewKind; item: ReviewItem }[], sourceFilter: SourceFilter) {
  if (sourceFilter === "all") {
    return items;
  }
  return items.filter((item) => item.kind === sourceFilter);
}

function canApproveReviewItem(kind: ReviewKind, item: ReviewItem) {
  if (item.status !== "pending") {
    return false;
  }

  const hasCoordinates = typeof item.latitude === "number" && typeof item.longitude === "number";
  if (hasCoordinates) {
    return true;
  }

  return kind === "submissions" && "google_maps_url" in item && !!item.google_maps_url;
}

function getTabCount(grouped: ReturnType<typeof groupReviewPayload>, key: StatusTab) {
  return key === "displaying" ? grouped.displaying.shops.length : grouped[key].reviewItems.length;
}

function setSuggestedStyles(updateDraft: (key: string, value: DraftRecord[string]) => void, value: string) {
  updateDraft(
    "suggested_styles",
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function toDraft(item: ReviewItem): DraftRecord {
  const base: DraftRecord = {
    name: item.name,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    phone: item.phone,
    website_url: item.website_url
  };

  if ("city" in item) {
    return {
      ...base,
      city: item.city,
      district: item.district
    };
  }

  return {
    ...base,
    google_maps_url: item.google_maps_url,
    instagram_url: item.instagram_url,
    facebook_url: item.facebook_url,
    suggested_styles: item.suggested_styles ?? [],
    submitter_note: item.submitter_note,
    submitter_email: item.submitter_email
  };
}
