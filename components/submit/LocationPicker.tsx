"use client";

import { Crosshair, X } from "lucide-react";
import maplibregl, { type LngLatLike, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

type Props = {
  latitude: number | null;
  longitude: number | null;
  mapStyle: unknown;
  onChange: (point: { latitude: number; longitude: number } | null) => void;
};

const TAIWAN_CENTER: LngLatLike = [120.9605, 23.6978];

export function LocationPicker({ latitude, longitude, mapStyle, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle as string | StyleSpecification,
      center: typeof longitude === "number" && typeof latitude === "number" ? [longitude, latitude] : TAIWAN_CENTER,
      zoom: typeof longitude === "number" && typeof latitude === "number" ? 13 : 6.4
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("click", (event) => {
      onChangeRef.current({ latitude: roundCoordinate(event.lngLat.lat), longitude: roundCoordinate(event.lngLat.lng) });
    });
    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markerRef.current?.remove();
    markerRef.current = null;

    if (typeof latitude === "number" && typeof longitude === "number") {
      markerRef.current = new maplibregl.Marker({ color: "#c43d26" }).setLngLat([longitude, latitude]).addTo(map);
    }
  }, [latitude, longitude]);

  return (
    <div className="location-picker">
      <div ref={containerRef} className="location-map" />
      <div className="location-tools">
        <span>
          <Crosshair size={14} />
          {typeof latitude === "number" && typeof longitude === "number"
            ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
            : "點擊地圖設定位置"}
        </span>
        {typeof latitude === "number" && typeof longitude === "number" ? (
          <button className="secondary-button" type="button" onClick={() => onChange(null)}>
            <X size={14} />
            清除
          </button>
        ) : null}
      </div>
    </div>
  );
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
