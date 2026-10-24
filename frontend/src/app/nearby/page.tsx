'use client';

import React, { Suspense, useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import { apiGet } from '@/lib/api';
import { subscribeRoom, LiveMessage } from '@/lib/live';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

interface Taxi {
  id: number;
  name: string;
  plate: string;
  phone: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  eta_minutes: number;
}

export default function NearbyPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>⏳ Radar yükleniyor...</div>}>
      <NearbyInner searchParams={searchParams} />
    </Suspense>
  );
}

function NearbyInner({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const resolved = use(searchParams);
  const [lat, setLat] = useState(parseFloat(resolved.lat || '40.9923'));
  const [lng, setLng] = useState(parseFloat(resolved.lng || '29.1278'));

  useEffect(() => {
    if (resolved.lat && resolved.lng) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
    });
  }, [resolved.lat, resolved.lng]);

  const [taxis, setTaxis] = useState<Taxi[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNearby = async () => {
    const data = await apiGet<{ taxis: Taxi[] }>(`/api/v1/tracking/nearby_taxis?lat=${lat}&lng=${lng}`);
    if (data) {
      setTaxis(data.taxis || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNearby();
    const interval = setInterval(fetchNearby, 8000);
    // WebSocket: şoför konumu değiştikçe radar anlık yenilenir
    const unsubscribe = subscribeRoom('locations', (msg: LiveMessage) => {
      if (msg.type === 'driver_location') fetchNearby();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--whatsapp)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            📡
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800' }}>WhatsApp Canlı Taksi Radarı</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Konumunuza En Yakın Müsait Taksiler ve Canlı Harita Görünümü
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="live-dot"></span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--emerald)' }}>
            {taxis.length} Müsait Taksi Bulundu
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '20px', flex: 1 }}>
        {/* Map */}
        <div className="glass-panel" style={{ padding: '12px', minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px 12px 12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--primary)' }}>
              📍 Konumunuz ve Çevredeki Canlı Taksiler
            </span>
          </div>

          <div style={{ flex: 1, minHeight: '460px', position: 'relative' }}>
            <LiveMap
              pickupPos={{ lat: lat, lng: lng, label: 'Sizin Konumunuz' }}
              otherTaxis={taxis.map((t) => ({
                lat: t.latitude,
                lng: t.longitude,
                name: t.name,
                plate: t.plate,
                eta: t.eta_minutes,
              }))}
              showRoute={false}
              zoom={14}
            />
          </div>
        </div>

        {/* Taxi List */}
        <div className="glass-panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)' }}>
            En Yakındaki Boş Araçlar
          </h2>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Yükleniyor...</div>
          ) : taxis.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Yakınlarda müsait taksi yok.</div>
          ) : (
            taxis.map((taxi) => (
              <div
                key={taxi.id}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {taxi.name}
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(250, 204, 21, 0.15)', color: 'var(--primary)', fontSize: '11px', fontWeight: '800' }}>
                      {taxi.plate}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Mesafe: <strong>{taxi.distance_km} km</strong> • Varış: <strong>~{taxi.eta_minutes} dk</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '999px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)', fontWeight: '700' }}>
                    BOŞTA
                  </span>
                  <a
                    href={`tel:${taxi.phone}`}
                    style={{ fontSize: '11px', color: 'var(--emerald)', textDecoration: 'none', fontWeight: '700' }}
                  >
                    📞 Ara
                  </a>
                </div>
              </div>
            ))
          )}

          <div style={{ marginTop: 'auto', padding: '14px', borderRadius: '10px', background: 'rgba(37, 211, 102, 0.1)', border: '1px solid rgba(37, 211, 102, 0.3)' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--whatsapp)', marginBottom: '4px' }}>
              📲 WhatsApp&apos;tan Anında Çağırın
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              WhatsApp sohbetine canlı konumunuzu ilettiğinizde en yakın taksi otomatik olarak eşleşecek ve size doğru yönlendirilecektir.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
