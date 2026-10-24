'use client';

import React, { Suspense, useEffect, useState, use, useRef } from 'react';
import dynamic from 'next/dynamic';
import { apiGet, API_URL } from '@/lib/api';
import { subscribeRoom, LiveMessage } from '@/lib/live';
import { useRealRoute } from '@/lib/useRealRoute';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

interface RideTrackingData {
  bot_username?: string;
  ride: {
    id: number;
    status: string;
    ride_type: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_address: string;
    distance_km: number | null;
    eta_minutes: number | null;
  };
  passenger: {
    name: string;
    phone: string;
  };
  driver: {
    id: number;
    name: string;
    phone: string;
    plate: string;
    latitude: number;
    longitude: number;
    status: string;
  } | null;
}

export default function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>⏳ Takip yükleniyor...</div>}>
      <TrackInner params={params} />
    </Suspense>
  );
}

function TrackInner({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const rideId = resolvedParams.id;

  const [data, setData] = useState<RideTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  // WebSocket'in canlı olduğunu göstermek için son push zamanı
  const [lastPush, setLastPush] = useState<string | null>(null);
  const dataRef = useRef<RideTrackingData | null>(null);
  dataRef.current = data;

  const fetchTracking = async () => {
    const json = await apiGet<RideTrackingData>(`/api/v1/tracking/ride/${rideId}`);
    if (json) {
      setData(json);
    }
    setLoading(false);
  };

  useEffect(() => {
    // 1) İlk yükleme + düşük frekanslı polling (fallback)
    fetchTracking();
    const interval = setInterval(fetchTracking, 10000);

    // 2) Milisaniyelik gerçek zamanlı push (ActionCable)
    const unsubscribe = subscribeRoom(`ride_${rideId}`, (msg: LiveMessage) => {
      setLastPush(new Date().toLocaleTimeString());
      if (msg.type === 'ride_update' && msg.ride) {
        const prev = dataRef.current;
        if (prev) {
          setData({
            ...prev,
            ride: { ...prev.ride, ...msg.ride } as RideTrackingData['ride'],
            driver: (msg.driver ? { ...prev.driver, ...msg.driver } : null) as RideTrackingData['driver'],
          });
        }
      } else if (msg.type === 'driver_location' && msg.driver && dataRef.current?.driver?.id === msg.driver.id) {
        // Atanan şoför konumu güncellendi
        const prev = dataRef.current;
        if (prev && prev.driver) {
          setData({
            ...prev,
            driver: { ...prev.driver, ...msg.driver } as RideTrackingData['driver'],
          });
        }
      }
      // Socket push geldiğinde stale polling'i hızlandırmana gerek yok; hemen yenile
      fetchTracking();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  // Hook'lar her render'da koşulsuz çağrılmalı (React kuralları)
  const driverFromData = data?.driver ? { lat: data.driver.latitude, lng: data.driver.longitude } : null;
  const pickupFromData = data ? { lat: data.ride.pickup_lat, lng: data.ride.pickup_lng } : null;
  const routeResult = useRealRoute(driverFromData, pickupFromData);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-muted)' }}>
        Canlı rota ve taksi telemetrisi yükleniyor...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#f87171' }}>
        Sürüş kaydı bulunamadı.
      </div>
    );
  }

  const { ride, passenger, driver } = data;
  const driverPos = driver ? { lat: driver.latitude, lng: driver.longitude, name: driver.name, plate: driver.plate, phone: driver.phone } : undefined;

  // gerçek karayolu rotası useRealRoute ile yukarıda hesaplandı (routeResult)

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Mobil responsive: telefonda tek kolon, harita tam genişlik */}
      <style>{`
        .track-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; align-items: start; }
        .contact-buttons { display: grid; grid-template-columns: 1fr 1fr; }
        @media (max-width: 950px) {
          .track-grid { grid-template-columns: 1fr; }
          .contact-buttons { grid-template-columns: 1fr; }
        }
      `}</style>
      {/* Header */}
      <header className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            🚕
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800' }}>Canlı Taksi & Rota Takip Ekranı</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              WhatsApp Üzerinden Paylaşılan Müşteri Canlı Takip Bağlantısı • Çağrı #{ride.id}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="live-dot"></span>
          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--emerald)' }}>
            CANLI GPS TELEMETRİSİ AKTİF {lastPush ? `• son güncelleme ${lastPush}` : ''}
          </span>
          <span style={{ padding: '4px 10px', borderRadius: '8px', background: 'rgba(250, 204, 21, 0.2)', color: 'var(--primary)', fontSize: '12px', fontWeight: '700' }}>
            {ride.status.toUpperCase()}
          </span>
        </div>
      </header>

      {/* Main Grid: Map & Ride Card */}
      <div className="track-grid" style={{ gap: '20px', flex: 1 }}>
        {/* Map */}
        <div className="glass-panel" style={{ padding: '12px', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px 12px 12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)' }}>
              🗺️ Harita Üzerinde Canlı Taksi & Varış Rotası
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {routeResult.coordinates ? '🛣️ Gerçek karayolu rotası (OSRM)' : '(Sarı Çizgi: Alış Noktasına Rotası)'}
            </span>
          </div>

          <div style={{ height: 'calc(100vw - 60px)', maxHeight: '560px', minHeight: '380px', position: 'relative' }}>
            <LiveMap
              driverPos={driverPos}
              pickupPos={{ lat: ride.pickup_lat, lng: ride.pickup_lng, label: passenger.name }}
              showRoute={true}
              routeCoords={routeResult.coordinates}
            />
          </div>
          <div style={{ padding: '10px 4px 6px 4px', fontSize: '11px', color: 'var(--text-muted)' }}>
            💡 Haritadaki 🚕/📍 noktalara dokun → arayın, yazın
          </div>
        </div>

        {/* Details Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Driver Info Card */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
              Atanan Taksi & Şoför
            </div>

            {driver ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800' }}>{driver.name}</h2>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>📞 {driver.phone}</span>
                  </div>
                  <div style={{ padding: '6px 12px', borderRadius: '8px', background: 'var(--primary)', color: '#000', fontWeight: '800', fontSize: '14px', letterSpacing: '0.5px' }}>
                    {driver.plate}
                  </div>
                </div>

                {/* Distance & ETA Highlights */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
                  <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>TAHMİNİ VARIŞ (ETA)</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--emerald)', marginTop: '4px' }}>
                      {routeResult.duration_min ?? ride.eta_minutes ?? 3} <span style={{ fontSize: '12px' }}>dakika</span>
                    </div>
                  </div>
                  <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>KALAN MESAFE</div>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)', marginTop: '4px' }}>
                      {routeResult.distance_km ? (routeResult.distance_km as number).toFixed(1) : (ride.distance_km ?? 0.5)} <span style={{ fontSize: '12px' }}>km</span>
                    </div>
                  </div>
                </div>

                {/* Şoförle iletişim: doğrudan arama + WhatsApp + Telegram (mini app relay) */}
                <div className="contact-buttons" style={{ gap: '10px', marginTop: '16px' }}>
                  <a
                    href={`tel:${driver.phone}`}
                    className="glass-panel"
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      textAlign: 'center',
                      fontSize: '13px',
                      fontWeight: '700',
                      background: 'rgba(37, 211, 102, 0.12)',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      color: 'var(--emerald)',
                    }}
                  >
                    📞 Şoförü Ara
                  </a>
                  <a
                    href={`https://wa.me/${driver.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Merhaba ${driver.name}, takip ekranından yazıyorum (Çağrı #${ride.id}).`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="glass-panel"
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      textAlign: 'center',
                      fontSize: '13px',
                      fontWeight: '700',
                      background: 'rgba(37, 211, 102, 0.12)',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      color: 'var(--emerald)',
                    }}
                  >
                    💬 WhatsApp'la Yaz
                  </a>
                  <a
                    href={`https://t.me/${data.bot_username || 'Gadis_Taxi_bot'}?start=write_driver_${driver.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="glass-panel"
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      textAlign: 'center',
                      fontSize: '13px',
                      fontWeight: '700',
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      color: '#38bdf8',
                    }}
                  >
                    ✈️ Telegram'dan Yaz
                  </a>
                </div>

                <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(37, 211, 102, 0.1)', border: '1px solid rgba(37, 211, 102, 0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>⚡</span>
                  <div style={{ fontSize: '12px', color: '#e2e8f0' }}>
                    Konum güncellemeleri <b>ActionCable (WebSocket)</b> ile milisaniyelik gecikmeyle aktarılıyor.
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '20px 0' }}>
                Henüz bir taksici atanmadı veya çağrı kuyrukta bekliyor.
              </div>
            )}
          </div>

          {/* Passenger & Trip Details Card */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
              Yolculuk Detayları
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Yolcu:</span> <strong>{passenger.name}</strong> ({passenger.phone})
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Alış Konumu:</span> ({ride.pickup_lat.toFixed(4)}, {ride.pickup_lng.toFixed(4)})
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Varış Hedefi:</span> {ride.dropoff_address || 'Belirtilmedi'}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Hizmet Türü:</span> {ride.ride_type === 'instant' ? '⚡ Anlık Çağrı' : '📅 İleri Randevu'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
