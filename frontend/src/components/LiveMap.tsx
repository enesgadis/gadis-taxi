'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapProps {
  driverPos?: { lat: number; lng: number; name?: string; plate?: string; phone?: string };
  pickupPos?: { lat: number; lng: number; label?: string; phone?: string };
  otherTaxis?: Array<{ lat: number; lng: number; name: string; plate: string; phone?: string; eta?: number }>;
  /** Taksi bekleyen / randevu oluşturan müşteriler: harita üzerinde YEŞİL 📍 noktalar */
  pickups?: Array<{ lat: number; lng: number; label: string; phone?: string; ride_id?: number }>;
  showRoute?: boolean;
  /** true: kadraj (fitBounds) yalnızca İLK çizimde yapılır; canlı güncellemelerde
   *  kullanıcının zoom/pan konumu KORUNUR (zoom başa dönme sorunu) */
  fitOnce?: boolean;
  /** useRealRoute çıktısı: OSRM/Google gerçek karayolu koordinatları [lat,lng][] */
  routeCoords?: [number, number][] | null;
  zoom?: number;
  /** Marker popup eylemleri: haritadaki taksiye/müşteriye tıklayınca direkt iletişim/kabul */
  onTaxiAction?: (taxi: { name: string; plate: string; phone?: string }) => void;
  onPickupAction?: (p: { label: string; phone?: string; ride_id?: number }, action: 'yaz' | 'kabul') => void;
}

/** Popup içindeki [data-mact] butonlarını dış callback'lere bağlar (Leaflet popup HTML) */
function wirePopupActions(marker: L.Marker, actions: Record<string, () => void>) {
  marker.on('popupopen', (e: L.LeafletEvent) => {
    const el = (e as L.PopupEvent).popup?.getElement?.() as HTMLElement | null;
    if (!el) return;
    el.querySelectorAll('[data-mact]').forEach((btn) => {
      const act = btn.getAttribute('data-mact') || '';
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        actions[act]?.();
        (ev.target as HTMLElement).closest('.leaflet-popup')?.querySelector('.leaflet-popup-close-button')?.dispatchEvent(new Event('click'));
      });
    });
  });
}

const POPUP_BTN = 'display:inline-block;padding:6px 12px;border-radius:8px;border:1px solid #334155;background:#0b0f19;color:#fff;font-size:12px;font-weight:700;cursor:pointer;margin:6px 4px 0 0;text-decoration:none;text-align:center';
const POPUP_BTN_G = POPUP_BTN.replace('#0b0f19', '#14532d').replace('#334155', '#22c55e');

export default function LiveMap({ driverPos, pickupPos, otherTaxis = [], pickups = [], showRoute = true, fitOnce = false, routeCoords, zoom = 14, onTaxiAction, onPickupAction }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter = driverPos
        ? [driverPos.lat, driverPos.lng]
        : pickupPos
        ? [pickupPos.lat, pickupPos.lng]
        : [41.037, 28.985];

      const map = L.map(mapContainerRef.current).setView(defaultCenter as [number, number], zoom);

      // Tile provider: varsayılan OSM (anahtar gerekmez), env ile değiştirilebilir
      // NEXT_PUBLIC_TILE_URL set edilirse Google Map tiles/Mapbox vs. kullanılabilir
      const tileUrl = process.env.NEXT_PUBLIC_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      markersRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layerGroup = markersRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    const bounds: L.LatLngTuple[] = [];

    // Taxi Icon
    const taxiIcon = L.divIcon({
      html: `
        <div style="
          background: #facc15;
          color: #000;
          font-weight: 800;
          font-size: 16px;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(250, 204, 21, 0.7);
          border: 2px solid #000;
        ">🚕</div>
      `,
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    // Passenger / Pickup Icon
    const passengerIcon = L.divIcon({
      html: `
        <div style="
          background: #25d366;
          color: #fff;
          font-weight: 800;
          font-size: 16px;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(37, 211, 102, 0.7);
          border: 2px solid #fff;
        ">📍</div>
      `,
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    // Add assigned Driver Marker
    if (driverPos && driverPos.lat && driverPos.lng) {
      const marker = L.marker([driverPos.lat, driverPos.lng], { icon: taxiIcon }).addTo(layerGroup);
      marker.bindPopup(
        `<b>${driverPos.name || 'Taksi'}</b><br/>Plaka: ${driverPos.plate || '-'}` +
        (driverPos.phone ? `<div style="margin-top:6px"><a class="mact" href="tel:${driverPos.phone}" style="${POPUP_BTN_G}">📞 Ara</a></div>` : '')
      );
      wirePopupActions(marker, {});
      bounds.push([driverPos.lat, driverPos.lng]);
    }

    // Add Passenger Pickup Marker
    if (pickupPos && pickupPos.lat && pickupPos.lng) {
      const marker = L.marker([pickupPos.lat, pickupPos.lng], { icon: passengerIcon }).addTo(layerGroup);
      marker.bindPopup(
        `<b>${pickupPos.label || 'Sizin Konumunuz (Alış Noktası)'}</b>` +
        (pickupPos.phone ? `<div style="margin-top:6px"><a class="mact" href="tel:${pickupPos.phone}" style="${POPUP_BTN_G}">📞 Ara</a></div>` : '')
      );
      wirePopupActions(marker, {});
      bounds.push([pickupPos.lat, pickupPos.lng]);
    }

    // Bekleyen / randevu müşterileri: tıkla → Yaz / Kabul Et / Ara
    pickups.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const m = L.marker([p.lat, p.lng], { icon: passengerIcon }).addTo(layerGroup);
      const actions: Record<string, () => void> = {
        yaz: () => onPickupAction?.(p, 'yaz'),
        kabul: () => onPickupAction?.(p, 'kabul'),
      };
      m.bindPopup(
        `<b>${p.label}</b>` +
        `<div style="margin-top:6px">` +
        `<button class="mact" data-mact="yaz" style="${POPUP_BTN}">✉️ Yaz</button>` +
        (p.ride_id != null ? `<button class="mact" data-mact="kabul" style="${POPUP_BTN_G}">✅ Kabul Et</button>` : '') +
        (p.phone ? `<a class="mact" href="tel:${p.phone}" style="${POPUP_BTN}">📞 Ara</a>` : '') +
        `</div>`
      );
      wirePopupActions(m, actions);
      bounds.push([p.lat, p.lng]);
    });

    // Add Other Taxis (for radar view): tıkla → Yaz / Ara
    otherTaxis.forEach((t) => {
      const otherTaxiIcon = L.divIcon({
        html: `
          <div style="
            background: #e2e8f0;
            color: #000;
            font-size: 14px;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            border: 2px solid #facc15;
          ">🚖</div>
        `,
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const m = L.marker([t.lat, t.lng], { icon: otherTaxiIcon }).addTo(layerGroup);
      m.bindPopup(
        `<b>${t.name}</b><br/>${t.plate}${t.eta ? `<br/>Tahmini Varış: ${t.eta} dk` : ''}` +
        `<div style="margin-top:6px">` +
        `<button class="mact" data-mact="yaz" style="${POPUP_BTN}">✉️ Yaz</button>` +
        (t.phone ? `<a class="mact" href="tel:${t.phone}" style="${POPUP_BTN}">📞 Ara</a>` : '') +
        `</div>`
      );
      wirePopupActions(m, {
        yaz: () => onTaxiAction?.({ name: t.name, plate: t.plate, phone: t.phone }),
      });
      bounds.push([t.lat, t.lng]);
    });

    // Draw Route Polyline if both driver and pickup exist
    if (showRoute && driverPos && pickupPos && driverPos.lat && pickupPos.lat) {
      const pathPoints: L.LatLngExpression[] =
        routeCoords && routeCoords.length > 1
          ? routeCoords // gerçek karayolu rotası (OSRM)
          : [
              // Rota servisi erişilemezse: düz çizgi fallback (degrade davranış)
              [driverPos.lat, driverPos.lng],
              [pickupPos.lat, pickupPos.lng],
            ];

      routeLineRef.current = L.polyline(pathPoints, {
        color: '#facc15',
        weight: 5,
        opacity: 0.85,
        dashArray: routeCoords ? undefined : '8, 8', // gerçek rota kesintisiz çizilir
      }).addTo(map);
    }

    const shouldFit = fitOnce ? !fittedRef.current : true;
    if (shouldFit && bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      fittedRef.current = true;
    } else if (shouldFit && bounds.length === 1) {
      map.setView(bounds[0], zoom);
      fittedRef.current = true;
    }
    else if (fitOnce && bounds.length === 1 && fittedRef.current) {
      // Kadrajı koru: sadece merkez marker'ı yumuşakça takip et
      map.panTo(bounds[0], { animate: true, duration: 0.6 });
    }
  }, [driverPos, pickupPos, otherTaxis, pickups, showRoute, fitOnce, routeCoords, zoom]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        borderRadius: '16px',
        overflow: 'hidden',
        zIndex: 1,
      }}
    />
  );
}
