'use client';

import React, { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { apiGet, apiPost, API_URL } from '@/lib/api';
import { subscribeRoom, LiveMessage } from '@/lib/live';
import { useRealRoute } from '@/lib/useRealRoute';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

interface DriverData {
  id: number;
  name: string;
  phone: string;
  plate: string;
  latitude: number;
  longitude: number;
  status: string;
}

interface CustomerRequest {
  id: number;
  passenger_name: string;
  passenger_phone: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  status: string;
  ride_type: string;
  scheduled_at: string | null;
  distance_to_pickup_km: number;
  is_assigned_to_me: boolean;
}

export default function DriverPortalPage() {
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRequest, setActiveRequest] = useState<CustomerRequest | null>(null);
  const [driverId, setDriverId] = useState<number>(1);
  const [loginPhone, setLoginPhone] = useState('');
  const [logged, setLogged] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPlate, setRegPlate] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const driverRef = useRef<DriverData | null>(null);
  driverRef.current = driver;

  useEffect(() => {
    const saved = localStorage.getItem('driver_id');
    if (saved) {
      setDriverId(Number(saved));
      setLogged(true);
    }

    // Bot'tan gelen link: /driver?phone=+9053x... → şifresiz otomatik giriş
    const params = new URLSearchParams(window.location.search);
    const phoneParam = params.get('phone');
    if (phoneParam) {
      apiPost<{ driver: DriverData }>('/api/v1/auth/driver', { phone: phoneParam }).then((data) => {
        if (data?.driver) {
          localStorage.setItem('driver_id', String(data.driver.id));
          setDriverId(data.driver.id);
          setDriver(data.driver);
          setLogged(true);
        }
      });
    }
  }, []);

  const loginDriver = async () => {
    setAuthLoading(true);
    try {
      if (authMode === 'register') {
        const data = await apiPost<{ driver: DriverData; message: string }>('/api/v1/auth/driver/register', {
          name: regName,
          phone: regPhone,
          plate: regPlate,
        });
        if (data?.driver) {
          localStorage.setItem('driver_id', String(data.driver.id));
          setDriverId(data.driver.id);
          setDriver(data.driver);
          setLogged(true);
        } else {
          alert('Kayıt başarısız. Ad, telefon ve plakayı kontrol edin (plaka başka bir kayıtta olabilir).');
        }
      } else {
        const data = await apiPost<{ driver: DriverData }>('/api/v1/auth/driver', {
          phone: loginPhone,
          driver_id: loginPhone ? undefined : driverId,
        });
        if (data?.driver) {
          localStorage.setItem('driver_id', String(data.driver.id));
          setDriverId(data.driver.id);
          setDriver(data.driver);
          setLogged(true);
        } else {
          alert('Şoför bulunamadı. Kayıtlı değilseniz "Kaydol" sekmesini kullanın.');
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchPortal = async () => {
    if (!logged) return;
    const json = await apiGet<{ driver: DriverData; requests: CustomerRequest[] }>(
      `/api/v1/tracking/driver_portal?driver_id=${driverId}`
    );
    if (json) {
      setDriver(json.driver);
      setRequests(json.requests || []);
      setActiveRequest((prev) => (prev ? (json.requests.find((r) => r.id === prev.id) || json.requests[0] || null) : json.requests[0] || null));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!logged) return;
    fetchPortal();
    const interval = setInterval(fetchPortal, 5000);
    // WebSocket: yeni çağrı / durum değişikliği geldiğinde anında yenile
    const unsubscribe = subscribeRoom('locations', (msg: LiveMessage) => {
      if (msg.type === 'ride_update' || msg.type === 'driver_location') fetchPortal();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged, driverId]);

  // Konum güncelleme: simülasyon veya gerçek GPS, ikisi de bu tek fonksiyondan geçer
  const updateLocation = async (lat: number, lng: number) => {
    const d = driverRef.current;
    if (!d) return;
    const json = await apiPost<{ driver: DriverData; active_ride_updated: { id: number; distance_km: number; eta_minutes: number } | null }>(
      '/api/v1/tracking/update_driver_location',
      { driver_id: d.id, latitude: lat, longitude: lng }
    );
    if (json?.driver) setDriver(json.driver);
  };

  // Sahte hareket (butonlarla) - test için
  const handleMoveLocation = async (latDelta: number, lngDelta: number) => {
    const d = driverRef.current;
    if (!d) return;
    await updateLocation(d.latitude + latDelta, d.longitude + lngDelta);
  };

  // Gerçek telefon GPS'i: navigator.geolocation.watchPosition
  const toggleGps = () => {
    if (gpsOn) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsOn(false);
      setGpsError(null);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Bu tarayıcı GPS desteklemiyor.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        updateLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => setGpsError(`GPS hatası: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    setGpsOn(true);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleAcceptRide = async (rideId: number) => {
    if (!driver) return;
    const json = await apiPost<{ success: boolean }>(
      '/api/v1/tracking/accept_ride',
      { driver_id: driver.id, ride_id: rideId }
    );
    if (json?.success) {
      alert('Müşteri çağrısı kabul edildi! Yolcuya canlı rota takip bağlantısı gönderildi.');
      fetchPortal();
    } else {
      alert('Kabul işlemi başarısız');
    }
  };

  const handleRideStatus = async (rideId: number, action: 'start' | 'complete' | 'cancel') => {
    if (!driver) return;
    const json = await apiPost<{ success: boolean; status: string }>(
      '/api/v1/tracking/update_ride_status',
      { driver_id: driver.id, ride_id: rideId, action_name: action }
    );
    if (json?.success) {
      fetchPortal();
    } else {
      alert('İşlem başarısız');
    }
  };

  // Hook'lar koşulsuz olmalı: rota hesabı erken return'lerden ÖNCE
  const routeEnabled = !!(logged && activeRequest && activeRequest.is_assigned_to_me && ['dispatched', 'in_progress'].includes(activeRequest.status));
  const routeResult = useRealRoute(
    routeEnabled ? { lat: driver?.latitude || 0, lng: driver?.longitude || 0 } : null,
    routeEnabled ? (activeRequest ? { lat: activeRequest.pickup_lat, lng: activeRequest.pickup_lng } : null) : null
  );

  if (!logged) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto', padding: 20 }}>
        <div className="glass-panel" style={{ padding: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Taksici girişi</h1>

          {/* Sekmeler */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: 14 }}>
            <button
              onClick={() => setAuthMode('login')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 13,
                background: authMode === 'login' ? '#facc15' : 'rgba(255,255,255,0.05)',
                color: authMode === 'login' ? '#000' : '#fff',
                border: '1px solid var(--border)',
              }}
            >
              Giriş Yap
            </button>
            <button
              onClick={() => setAuthMode('register')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 13,
                background: authMode === 'register' ? '#facc15' : 'rgba(255,255,255,0.05)',
                color: authMode === 'register' ? '#000' : '#fff',
                border: '1px solid var(--border)',
              }}
            >
              Kaydol
            </button>
          </div>

          {authMode === 'login' ? (
            <>
              <input
                placeholder="Telefon örn +905321000006"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, background: '#000', color: '#fff', border: '1px solid var(--border)', marginBottom: 10 }}
              />
              <button
                onClick={() => loginDriver()}
                disabled={authLoading}
                style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, background: '#facc15', fontWeight: 800, cursor: 'pointer' }}
              >
                {authLoading ? 'Giriş yapılıyor…' : 'Giriş'}
              </button>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                Test hesabı: any from listed drivers (ör. <strong>+905321000004</strong>)
              </div>
            </>
          ) : (
            <>
              <input
                placeholder="Ad Soyad örn Mehmet Taksi"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, background: '#000', color: '#fff', border: '1px solid var(--border)', marginBottom: 10 }}
              />
              <input
                placeholder="Telefon örn +905329999001"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, background: '#000', color: '#fff', border: '1px solid var(--border)', marginBottom: 10 }}
              />
              <input
                placeholder="Plaka örn 34 ABC 123"
                value={regPlate}
                onChange={(e) => setRegPlate(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 8, background: '#000', color: '#fff', border: '1px solid var(--border)', marginBottom: 10 }}
              />
              <button
                onClick={() => loginDriver()}
                disabled={authLoading}
                style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)', fontWeight: 800, cursor: 'pointer', color: '#fff' }}
              >
                {authLoading ? 'Kayıt yapılıyor…' : '🚕 Kaydol ve Çağrı Almaya Başla'}
              </button>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                Kayıt sonrası otomatik giriş yapılır ve panel yönlendirilir.
              </div>
            </>
          )}

          <a href="/login" style={{ display: 'block', marginTop: 12, fontSize: 13, color: 'var(--blue)' }}>Yolcu girişi</a>
        </div>
      </div>
    );
  }

  const googleNavUrl = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
    `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;

  const driverPos = driver ? { lat: driver.latitude, lng: driver.longitude, name: driver.name, plate: driver.plate } : undefined;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Driver Header */}
      <header className="glass-panel" style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'var(--primary)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
            🚖
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: '800' }}>Taksici Paneli & Canlı Müşteri Talepleri</h1>
              {driver && (
                <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(250, 204, 21, 0.2)', color: 'var(--primary)', fontWeight: '800', fontSize: '13px' }}>
                  {driver.plate}
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Şoför: {driver?.name} • Konum: ({driver?.latitude.toFixed(4)}, {driver?.longitude.toFixed(4)})
            </p>
          </div>
        </div>

        {/* GPS Controls: gerçek telefon GPS'i + simülasyon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={toggleGps}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: gpsOn ? 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)' : 'linear-gradient(135deg, #facc15 0%, #eab308 100%)',
              border: 'none',
              color: gpsOn ? '#fff' : '#000',
              fontSize: '13px',
              fontWeight: '800',
              cursor: 'pointer',
            }}
          >
            {gpsOn ? '🛰️ GPS AKTİ - Kapat' : '📍 Konumu Aç (Gerçek GPS)'}
          </button>
          {gpsError && (
            <span style={{ fontSize: '11px', color: '#f87171' }}>{gpsError}</span>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Test hafif simülasyon:</span>
          <button
            onClick={() => handleMoveLocation(0.001, 0)}
            style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)', color: '#fff', fontSize: '12px', cursor: 'pointer' }}
          >
            ⬆️
          </button>
          <button
            onClick={() => handleMoveLocation(-0.001, 0)}
            style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)', color: '#fff', fontSize: '12px', cursor: 'pointer' }}
          >
            ⬇️
          </button>
          <button
            onClick={() => handleMoveLocation(0, 0.001)}
            style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)', color: '#fff', fontSize: '12px', cursor: 'pointer' }}
          >
            ➡️
          </button>
          <button
            onClick={() => handleMoveLocation(0, -0.001)}
            style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)', color: '#fff', fontSize: '12px', cursor: 'pointer' }}
          >
            ⬅️
          </button>
        </div>
      </header>

      {/* Main Grid: Customer List & Interactive Map */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px', flex: 1 }}>
        {/* Left: Customer Requests Waiting for Taxi */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700' }}>
              👥 Taksi İsteyen Müşteriler ({requests.length})
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--emerald)' }}>● Canlı (WebSocket + Polling)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '600px' }}>
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Yükleniyor...</div>
            ) : requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Şu anda bekleyen müşteri çağrısı bulunmuyor.
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => setActiveRequest(req)}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: activeRequest?.id === req.id ? 'rgba(250, 204, 21, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid',
                    borderColor: activeRequest?.id === req.id ? 'var(--primary)' : 'var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '15px' }}>{req.passenger_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📞 {req.passenger_phone}</div>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: '700',
                        background:
                          req.status === 'dispatched' ? 'rgba(16, 185, 129, 0.15)'
                          : req.status === 'in_progress' ? 'rgba(37, 99, 235, 0.2)'
                          : req.status === 'completed' ? 'rgba(200, 200, 200, 0.2)'
                          : 'rgba(250, 204, 21, 0.15)',
                        color:
                          req.status === 'dispatched' ? 'var(--emerald)'
                          : req.status === 'in_progress' ? '#60a5fa'
                          : req.status === 'completed' ? '#cbd5e1'
                          : 'var(--primary)',
                      }}
                    >
                      {req.status === 'dispatched' ? 'ATANDI'
                        : req.status === 'in_progress' ? 'YOLCULUKTA'
                        : req.status === 'completed' ? 'TAMAMLANDI'
                        : req.status === 'cancelled' ? 'İPTAL' : 'BEKLİYOR'}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '10px' }}>
                    📍 <strong>Alış Konumu:</strong> ({req.pickup_lat.toFixed(4)}, {req.pickup_lng.toFixed(4)})<br />
                    🎯 <strong>Hedef:</strong> {req.dropoff_address || 'Belirtilmedi'}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--emerald)', fontWeight: '700' }}>
                      Mesafe: {req.distance_to_pickup_km.toFixed(2)} km
                    </span>

                    {req.status === 'pending' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptRide(req.id);
                        }}
                        style={{ padding: '6px 14px', borderRadius: '8px', background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)', border: 'none', color: '#000', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
                      >
                        ✅ Çağrıyı Kabul Et
                      </button>
                    )}

                    {req.is_assigned_to_me && req.status === 'dispatched' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRideStatus(req.id, 'start'); }}
                          style={{ padding: '6px 12px', borderRadius: '8px', background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)', border: 'none', color: '#fff', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          🚕 Yolcuyu Aldım
                        </button>
                        <a
                          href={googleNavUrl({ lat: driver?.latitude || 0, lng: driver?.longitude || 0 }, { lat: req.pickup_lat, lng: req.pickup_lng })}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid var(--border)', color: '#fff', fontSize: '12px', fontWeight: '700', textDecoration: 'none' }}
                        >
                          🧭 Navigasyon
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRideStatus(req.id, 'cancel'); }}
                          style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
                        >
                          ❌
                        </button>
                      </div>
                    )}

                    {req.is_assigned_to_me && req.status === 'in_progress' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRideStatus(req.id, 'complete'); }}
                        style={{ padding: '6px 14px', borderRadius: '8px', background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)', border: 'none', color: '#fff', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}
                      >
                        🏁 Tur Tamamlandı
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Map with Route and Telemetry */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--primary)' }}>
              🗺️ Taksici GPS Konumu ve Müşteriye Giden Rota
            </span>
            {activeRequest && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Seçili Müşteri: <strong>{activeRequest.passenger_name}</strong>
              </span>
            )}
          </div>

          <div style={{ flex: 1, minHeight: '520px', position: 'relative' }}>
            <LiveMap
              driverPos={driverPos}
              pickupPos={activeRequest ? { lat: activeRequest.pickup_lat, lng: activeRequest.pickup_lng, label: activeRequest.passenger_name } : undefined}
              showRoute={true}
              routeCoords={routeResult.coordinates}
              zoom={14}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
