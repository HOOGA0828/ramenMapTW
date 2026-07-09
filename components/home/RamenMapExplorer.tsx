"use client";

import { ChevronLeft, ChevronRight, ExternalLink, LocateFixed, Search, SlidersHorizontal, X } from "lucide-react";
import maplibregl, {
  type LngLatLike,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
  type StyleSpecification
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getGoogleMapsSearchUrl } from "@/lib/googleMaps";
import type { Shop } from "@/lib/types";

type Props = {
  shops: Shop[];
  mapStyle: string | StyleSpecification;
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

const PAGE_SIZE = 10;
const TAIWAN_CENTER: LngLatLike = [120.9605, 23.6978];
const TAIWAN_BOUNDS: [[number, number], [number, number]] = [
  [118.0, 20.3],
  [123.8, 26.6]
];
const TAIWAN_MAX_BOUNDS: [[number, number], [number, number]] = [
  [116.0, 19.0],
  [125.8, 27.8]
];
const SHOP_SOURCE_ID = "ramen-shop-results";
const SHOP_LAYER_ID = "ramen-shop-pins";
const SHOP_ICON_ID = "ramen-pin";
const ADMIN_DESCRIPTION_PATTERNS = ["一鍵審核", "審核通過", "bulk approve"];

const statusLabel: Record<string, string> = {
  open: "營業中",
  temporarily_closed: "暫時休業",
  permanently_closed: "永久歇業",
  unknown: "狀態未知"
};

export function RamenMapExplorer({ shops, mapStyle }: Props) {
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapShopsRef = useRef<Shop[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [query, setQuery] = useState("");
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [page, setPage] = useState(1);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "ready" | "unavailable" | "denied">("idle");
  const [nearestMode, setNearestMode] = useState(false);

  const matchingShops = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return shops.filter((shop) => {
      const hasLocation = typeof shop.latitude === "number" && typeof shop.longitude === "number";
      if (!hasLocation) {
        return false;
      }

      const searchable = [shop.name, shop.address, shop.city, shop.district, shop.styles.map((style) => style.name).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [query, shops]);

  const allLocatedShops = useMemo(
    () => shops.filter((shop) => typeof shop.latitude === "number" && typeof shop.longitude === "number"),
    [shops]
  );

  const visibleShops = useMemo(() => {
    if (!nearestMode || !userLocation) {
      return matchingShops;
    }

    return [...matchingShops]
      .sort((left, right) => getDistanceFromUser(left, userLocation) - getDistanceFromUser(right, userLocation))
      .slice(0, PAGE_SIZE);
  }, [matchingShops, nearestMode, userLocation]);

  const totalPages = nearestMode ? 1 : Math.max(1, Math.ceil(visibleShops.length / PAGE_SIZE));
  const pagedShops = useMemo(
    () => (nearestMode ? visibleShops : visibleShops.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)),
    [nearestMode, page, visibleShops]
  );
  const isNearestReady = nearestMode && !!userLocation;

  mapShopsRef.current = allLocatedShops;

  const syncMapSize = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.resize();
  }, []);

  const scheduleMapResize = useCallback(() => {
    syncMapSize();
    window.requestAnimationFrame(syncMapSize);
    window.setTimeout(syncMapSize, 80);
    window.setTimeout(syncMapSize, 220);
    window.setTimeout(syncMapSize, 420);
  }, [syncMapSize]);

  function centerMapOnUser(location: UserLocation, zoom = 14) {
    mapRef.current?.flyTo({ center: [location.longitude, location.latitude], zoom, essential: true });
  }

  function requestUserLocation(activateNearest: boolean) {
    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      return;
    }

    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setUserLocation(nextLocation);
        setLocationStatus("ready");

        if (activateNearest) {
          setNearestMode(true);
          setQuery("");
          setPage(1);
        }
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000 * 60 * 5,
        timeout: 10000
      }
    );
  }

  function showNearestShops() {
    if (userLocation) {
      setNearestMode(true);
      setQuery("");
      setPage(1);
      centerMapOnUser(userLocation, 14);
      return;
    }

    requestUserLocation(true);
  }

  useEffect(() => {
    setPage(1);
  }, [query, nearestMode]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: TAIWAN_CENTER,
      zoom: 7,
      minZoom: 6,
      maxZoom: 18,
      maxBounds: TAIWAN_MAX_BOUNDS
    });

    const handleShopClick = (event: MapLayerMouseEvent) => {
      const shopId = event.features?.[0]?.properties?.shopId;
      if (typeof shopId !== "string") {
        return;
      }

      const shop = mapShopsRef.current.find((item) => item.id === shopId);
      if (!shop || typeof shop.longitude !== "number" || typeof shop.latitude !== "number") {
        return;
      }

      setSelectedShop(shop);
      map.flyTo({ center: [shop.longitude, shop.latitude], zoom: Math.max(map.getZoom(), 13), essential: true });
    };
    const showPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const hidePointer = () => {
      map.getCanvas().style.cursor = "";
    };
    const handleMapLoad = () => {
      ensureShopMarkerLayer(map);
      updateShopMarkerSource(map, mapShopsRef.current);
      scheduleMapResize();
      setMapReady(true);
    };

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.fitBounds(TAIWAN_BOUNDS, { padding: 32, duration: 0 });
    if (map.loaded()) {
      handleMapLoad();
    } else {
      map.on("load", handleMapLoad);
    }
    map.on("click", SHOP_LAYER_ID, handleShopClick);
    map.on("mouseenter", SHOP_LAYER_ID, showPointer);
    map.on("mouseleave", SHOP_LAYER_ID, hidePointer);
    scheduleMapResize();

    return () => {
      map.off("load", handleMapLoad);
      map.off("click", SHOP_LAYER_ID, handleShopClick);
      map.off("mouseenter", SHOP_LAYER_ID, showPointer);
      map.off("mouseleave", SHOP_LAYER_ID, hidePointer);
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [mapStyle, scheduleMapResize]);

  useEffect(() => {
    requestUserLocation(true);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");

    function syncPanelMode() {
      setIsPanelCollapsed(mediaQuery.matches);
      scheduleMapResize();
    }

    syncPanelMode();
    mediaQuery.addEventListener("change", syncPanelMode);

    return () => {
      mediaQuery.removeEventListener("change", syncPanelMode);
    };
  }, [scheduleMapResize]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !userLocation) {
      return;
    }

    centerMapOnUser(userLocation, 14);
    userMarkerRef.current?.remove();

    const markerEl = document.createElement("div");
    markerEl.className = "user-location-marker";
    markerEl.setAttribute("aria-label", "目前位置");

    userMarkerRef.current = new maplibregl.Marker({ element: markerEl })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(map);
  }, [mapReady, userLocation]);

  useEffect(() => {
    scheduleMapResize();
  }, [isPanelCollapsed, scheduleMapResize]);

  useEffect(() => {
    const targets = [mapWrapRef.current, mapContainerRef.current].filter(Boolean) as HTMLDivElement[];
    if (!targets.length || !("ResizeObserver" in window)) {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleMapResize();
    });
    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, [scheduleMapResize]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    ensureShopMarkerLayer(map);
    updateShopMarkerSource(map, allLocatedShops);
  }, [allLocatedShops, mapReady]);

  function resetFilters() {
    setQuery("");
    setNearestMode(false);
  }

  function closePanelOnMobile() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setIsPanelCollapsed(true);
    }
  }

  return (
    <section className={isPanelCollapsed ? "map-page is-panel-collapsed" : "map-page"}>
      <aside className={isPanelCollapsed ? "filter-panel is-collapsed" : "filter-panel"} aria-label="拉麵店查詢">
        {isPanelCollapsed ? (
          <button
            className="icon-button panel-toggle"
            type="button"
            onClick={() => setIsPanelCollapsed(false)}
            title="展開查詢"
            aria-label="展開查詢"
          >
            <ChevronRight size={18} />
          </button>
        ) : (
          <>
            <div className="panel-heading">
              <div>
                <p>Ramen Map</p>
                <h1>找一碗台灣拉麵</h1>
              </div>
              <div className="panel-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={showNearestShops}
                  title="定位目前位置"
                  aria-label="定位目前位置"
                >
                  <LocateFixed size={18} />
                </button>
                <button
                  className="icon-button panel-toggle"
                  type="button"
                  onClick={() => setIsPanelCollapsed(true)}
                  title="收合查詢"
                  aria-label="收合查詢"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>

            <label className="search-box">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setNearestMode(false);
                }}
                placeholder="搜尋店名、地址、縣市"
              />
            </label>

            <button className="primary-button nearest-button" type="button" onClick={showNearestShops}>
              <LocateFixed size={16} />
              查詢最近店家
            </button>

            <div className="location-note" aria-live="polite">
              {locationStatus === "locating" ? "正在取得目前位置..." : null}
              {locationStatus === "denied" ? "尚未開啟定位權限" : null}
              {locationStatus === "unavailable" ? "目前無法取得定位" : null}
              {isNearestReady ? "已依目前位置顯示最近 10 家" : null}
            </div>

            <div className="result-summary">
              <strong>{isNearestReady ? pagedShops.length : visibleShops.length}</strong>
              <span>{isNearestReady ? "間最近店家" : "間符合條件"}</span>
              {query || nearestMode ? (
                <button type="button" onClick={resetFilters}>
                  <X size={14} />
                  清除
                </button>
              ) : null}
            </div>

            <div className="shop-list" aria-label="店家列表">
              {pagedShops.map((shop) => (
                <button
                  className={selectedShop?.id === shop.id ? "shop-row is-selected" : "shop-row"}
                  key={shop.id}
                  type="button"
                  onClick={() => {
                    setSelectedShop(shop);
                    if (typeof shop.longitude === "number" && typeof shop.latitude === "number") {
                      mapRef.current?.flyTo({ center: [shop.longitude, shop.latitude], zoom: 14 });
                    }
                    closePanelOnMobile();
                  }}
                >
                  <span>{shop.name}</span>
                  <small>{[shop.city, shop.district].filter(Boolean).join(" ") || shop.address || "地址未提供"}</small>
                </button>
              ))}
            </div>

            {!nearestMode ? (
              <div className="pagination-bar" aria-label="店家列表分頁">
                <button
                  className="icon-button"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  第 {page} / {totalPages} 頁
                </span>
                <button
                  className="icon-button"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            ) : null}
          </>
        )}
      </aside>

      <div ref={mapWrapRef} className="map-wrap">
        <div ref={mapContainerRef} className="map-canvas" />
        {isPanelCollapsed ? (
          <button
            className="mobile-filter-fab"
            type="button"
            onClick={() => setIsPanelCollapsed(false)}
            aria-label="開啟篩選"
          >
            <SlidersHorizontal size={18} />
            篩選
          </button>
        ) : null}
        {selectedShop ? <ShopDetail shop={selectedShop} onClose={() => setSelectedShop(null)} /> : null}
      </div>
    </section>
  );
}

function ShopDetail({ shop, onClose }: { shop: Shop; onClose: () => void }) {
  const googleMapsUrl = shop.google_maps_url || getGoogleMapsSearchUrl(shop.name, shop.address);
  const publicDescription = getPublicDescription(shop.description);

  return (
    <article className="shop-detail" aria-label="店家資訊">
      <button className="icon-button detail-close" type="button" onClick={onClose} title="關閉店家資訊">
        <X size={18} />
      </button>
      <div className="detail-main">
        <span className="status-pill">{statusLabel[shop.status] ?? shop.status}</span>
        <h2>{shop.name}</h2>
        <p>{shop.address || "地址未提供"}</p>
      </div>
      <div className="detail-tags">
        {shop.styles.length ? shop.styles.map((style) => <span key={style.id}>{style.name}</span>) : <span>派系未提供</span>}
      </div>
      {publicDescription ? <p className="detail-description">{publicDescription}</p> : null}
      <div className="detail-links">
        <a className="primary-button" href={googleMapsUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          Google Maps 搜尋
        </a>
        {shop.website_url ? (
          <a className="secondary-button" href={shop.website_url} target="_blank" rel="noreferrer">
            官網
          </a>
        ) : null}
        {shop.instagram_url ? (
          <a className="secondary-button" href={shop.instagram_url} target="_blank" rel="noreferrer">
            Instagram
          </a>
        ) : null}
        {shop.facebook_url ? (
          <a className="secondary-button" href={shop.facebook_url} target="_blank" rel="noreferrer">
            Facebook
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ensureShopMarkerLayer(map: MapLibreMap) {
  if (!map.hasImage(SHOP_ICON_ID)) {
    map.addImage(SHOP_ICON_ID, createRamenPinImage(), { pixelRatio: 2 });
  }

  if (!map.getSource(SHOP_SOURCE_ID)) {
    map.addSource(SHOP_SOURCE_ID, {
      type: "geojson",
      data: createShopFeatureCollection([])
    });
  }

  if (!map.getLayer(SHOP_LAYER_ID)) {
    map.addLayer({
      id: SHOP_LAYER_ID,
      type: "symbol",
      source: SHOP_SOURCE_ID,
      layout: {
        "icon-image": SHOP_ICON_ID,
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": 1
      }
    });
  }
}

function updateShopMarkerSource(map: MapLibreMap, shops: Shop[]) {
  const source = map.getSource(SHOP_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData(createShopFeatureCollection(shops));
}

function createShopFeatureCollection(shops: Shop[]) {
  return {
    type: "FeatureCollection" as const,
    features: shops.flatMap((shop) => {
      if (typeof shop.latitude !== "number" || typeof shop.longitude !== "number") {
        return [];
      }

      return [
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [shop.longitude, shop.latitude]
          },
          properties: {
            shopId: shop.id
          }
        }
      ];
    })
  };
}

function createRamenPinImage() {
  const pixelRatio = 2;
  const width = 32;
  const height = 40;
  const canvas = document.createElement("canvas");
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;

  const context = canvas.getContext("2d");
  if (!context) {
    return new ImageData(canvas.width, canvas.height);
  }

  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = "#c43d26";
  context.strokeStyle = "#fffaf0";
  context.lineWidth = 2;

  context.beginPath();
  context.moveTo(16, 39);
  context.lineTo(8, 27);
  context.lineTo(24, 27);
  context.closePath();
  context.fill();

  context.beginPath();
  context.arc(16, 16, 15, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.strokeStyle = "#fffaf0";
  context.lineWidth = 3;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(9, 17);
  context.quadraticCurveTo(16, 25, 23, 17);
  context.stroke();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function getDistanceFromUser(shop: Shop, location: UserLocation) {
  if (typeof shop.latitude !== "number" || typeof shop.longitude !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  return getDistanceInKm(location.latitude, location.longitude, shop.latitude, shop.longitude);
}

function getDistanceInKm(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) * Math.cos(toLatitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getPublicDescription(description: string | null) {
  if (!description) {
    return null;
  }

  const normalized = description.trim().toLocaleLowerCase();
  if (!normalized || ADMIN_DESCRIPTION_PATTERNS.some((pattern) => normalized.includes(pattern.toLocaleLowerCase()))) {
    return null;
  }

  return description;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
