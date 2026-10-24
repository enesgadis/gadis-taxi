'use client';

import React, { useState, useEffect } from 'react';
import { API_URL, apiPost } from '@/lib/api';
import { subscribeRoom } from '@/lib/live';

interface Driver {
  id: number;
  name: string;
  phone: string;
  plate: string;
  latitude: number;
  longitude: number;
  status: 'available' | 'busy' | 'offline';
}

interface Ride {
  id: number;
  passenger_name: string;
  passenger_phone: string;
  driver_name: string;
  driver_plate: string;
  status: string;
  ride_type: 'instant' | 'scheduled';
  scheduled_at: string | null;
  reminder_sent_at: string | null;
  pickup_latitude: number;
  pickup_longitude: number;
  distance_km: number | null;
  eta_minutes: number | null;
  created_at: string;
}

interface StationRule {
  id: number;
  title: string;
  category: string;
  content: string;
  keywords: string;
}

interface UpcomingAppointment {
  id: number;
  passenger_phone: string;
  driver_name: string;
  scheduled_at: string;
  reminder_status: string;
}

interface Stats {
  total_drivers: number;
  available_drivers: number;
  busy_drivers: number;
  total_rides: number;
  scheduled_active: number;
  rules_count: number;
  solid_queue_jobs: number;
  solid_queue_scheduled: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [recentRides, setRecentRides] = useState<Ride[]>([]);
  const [rules, setRules] = useState<StationRule[]>([]);
  const [appointments, setAppointments] = useState<UpcomingAppointment[]>([]);
  const [activeTab, setActiveTab] = useState<'cockpit' | 'rag' | 'simulator'>('cockpit');

  // Simulator Form State
  const [simType, setSimType] = useState<'location' | 'text'>('location');
  const [simPhone, setSimPhone] = useState('+905321112233');
  const [simPassengerName, setSimPassengerName] = useState('Zeynep Demir');
  const [simLat, setSimLat] = useState('40.9923');
  const [simLng, setSimLng] = useState('29.1278');
  const [simText, setSimText] = useState('Yarın saat 15:00 Ataşehir randevu');
  const [simChannel, setSimChannel] = useState<'whatsapp' | 'telegram'>('whatsapp');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cockpit/status`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setDrivers(data.drivers || []);
        setRecentRides(data.recent_rides || []);
        setRules(data.rules || []);
        setAppointments(data.upcoming_appointments || []);
      }
    } catch (err) {
      console.error('API fetch error:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    // WebSocket: şoför konumu / yolculuk durumunda anlık yenileme
    const unsubscribe = subscribeRoom('locations', () => fetchStatus());
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimLoading(true);
    setSimResult(null);

    try {
      const res = await fetch(`${API_URL}/api/v1/cockpit/simulate_webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: simType,
          phone: simPhone,
          passenger_name: simPassengerName,
          latitude: parseFloat(simLat),
          longitude: parseFloat(simLng),
          text: simText,
          channel: simChannel,
          telegram_id: simChannel === 'telegram' ? simPhone : undefined,
        }),
      });
      const data = await res.json();
      setSimResult(data);
      fetchStatus();
    } catch (err) {
      setSimResult({ error: 'İstek gönderilemedi. Rails API ayakta mı kontrol edin.' });
    } finally {
      setSimLoading(false);
    }
  };

  const triggerRemindersNow = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/cockpit/trigger_reminders`, {
        method: 'POST',
      });
      const data = await res.json();
      alert(data.message || 'Hatırlatıcılar tetiklendi.');
      fetchStatus();
    } catch (err) {
      alert('Tetikleme başarısız');
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #facc15 0%, #eab308 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '0 8px 20px -4px rgba(250, 204, 21, 0.4)',
            }}
          >
            🚕
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' }}>
              TaxiFlow AI <span style={{ color: 'var(--primary)', fontSize: '14px', fontWeight: '600' }}>v8.0</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Rails 8 API + Next.js WhatsApp Otonom Dispeç, Solid Queue & RAG Platformu
            </p>
          </div>
        </div>

        {/* Live Status Indicators & Direct Portal Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <a
            href="/login"
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              background: 'rgba(37, 211, 102, 0.15)',
              border: '1px solid rgba(37, 211, 102, 0.4)',
              color: 'var(--whatsapp)',
              fontSize: '12px',
              fontWeight: '700',
              textDecoration: 'none',
            }}
          >
            🔑 Uygulama girişi
          </a>
          <a
            href="/driver"
            target="_blank"
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              background: 'rgba(250, 204, 21, 0.15)',
              border: '1px solid rgba(250, 204, 21, 0.4)',
              color: 'var(--primary)',
              fontSize: '12px',
              fontWeight: '700',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🚖 Taksici Paneli (Müşteri Listesi) ↗
          </a>

          <a
            href="/nearby"
            target="_blank"
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: 'var(--blue)',
              fontSize: '12px',
              fontWeight: '700',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📡 Müşteri Yakındaki Taksiler Radarı ↗
          </a>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '999px',
              background: 'rgba(37, 211, 102, 0.1)',
              border: '1px solid rgba(37, 211, 102, 0.3)',
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--whatsapp)',
            }}
          >
            <span className="live-dot-whatsapp"></span>
            WhatsApp Cloud API: Aktif
          </div>
        </div>
      </header>

      {/* Quick Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[
          { id: 'cockpit', label: '🎛️ Canlı Dispeç Kokpiti' },
          { id: 'simulator', label: '📱 WhatsApp Test Simülatörü' },
          { id: 'rag', label: '🧠 RAG & Durak Kuralları' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid',
              borderColor: activeTab === tab.id ? 'var(--primary)' : 'var(--border)',
              background: activeTab === tab.id ? 'var(--primary-glow)' : 'transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '700' }}>
            Müsait Taksiler
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--emerald)', marginTop: '4px' }}>
            {stats?.available_drivers ?? 0}
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '400' }}> / {stats?.total_drivers ?? 0}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Otonom GPS eşleşmeye hazır
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '700' }}>
            Toplam Çağrı / Sürüş
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--primary)', marginTop: '4px' }}>
            {stats?.total_rides ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            WhatsApp botu üzerinden açılan
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '700' }}>
            Aktif İleri Randevular
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--blue)', marginTop: '4px' }}>
            {stats?.scheduled_active ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Solid Queue 1-saat uyarısı aktif
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: '700' }}>
            RAG Bilgi & Tarife Kuralı
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--purple)', marginTop: '4px' }}>
            {stats?.rules_count ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Strict JSON korumalı deterministik katman
          </div>
        </div>
      </div>

      {/* TAB 1: COCKPIT */}
      {activeTab === 'cockpit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px' }}>
          {/* Left: Driver Radar */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700' }}>🚖 Filo Taksi Radarı (GPS)</h2>
              <span style={{ fontSize: '12px', color: 'var(--emerald)' }}>● Canlı Telemetri</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {drivers.map((d) => (
                <div
                  key={d.id}
                  style={{
                    padding: '12px 14px',
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
                      {d.name}
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(250, 204, 21, 0.15)',
                          color: 'var(--primary)',
                          fontWeight: '800',
                        }}
                      >
                        {d.plate}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                      📞 {d.phone} • GPS: ({d.latitude.toFixed(4)}, {d.longitude.toFixed(4)})
                    </div>
                  </div>

                  <div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        background:
                          d.status === 'available'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : d.status === 'busy'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(148, 163, 184, 0.15)',
                        color:
                          d.status === 'available'
                            ? 'var(--emerald)'
                            : d.status === 'busy'
                            ? '#f87171'
                            : 'var(--text-muted)',
                      }}
                    >
                      {d.status === 'available' ? 'MÜSAİT' : d.status === 'busy' ? 'GÖREVDE' : 'ÇEVRİMDIŞI'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Live Rides & Appointments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Upcoming Appointments via Solid Queue */}
            <div className="glass-panel" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700' }}>⏰ İleri Tarihli Randevular (Solid Queue)</h2>
                <button
                  onClick={triggerRemindersNow}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: 'var(--blue)',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  ⚡ 1-Saat Kuralını Test Et
                </button>
              </div>

              {appointments.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Henüz ileri tarihli aktif randevu bulunmuyor. Test simülatöründen ekleyebilirsiniz.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {appointments.map((app) => (
                    <div
                      key={app.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'rgba(56, 189, 248, 0.05)',
                        border: '1px solid rgba(56, 189, 248, 0.2)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px' }}>
                          📅 Randevu: {new Date(app.scheduled_at).toLocaleString('tr-TR')}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Yolcu: {app.passenger_phone} • Şoför: {app.driver_name}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: 'var(--emerald)',
                          fontWeight: '700',
                        }}
                      >
                        {app.reminder_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Rides */}
            <div className="glass-panel" style={{ padding: '22px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px' }}>🚕 Son Sürüş ve Çağrı Kayıtları</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentRides.slice(0, 6).map((ride) => (
                  <div
                    key={ride.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '13px' }}>
                        #{ride.id} • {ride.passenger_name} ({ride.passenger_phone})
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Atanan: {ride.driver_name} ({ride.driver_plate}) • Mesafe: {ride.distance_km ?? '-'} km (ETA:{' '}
                        {ride.eta_minutes ?? '-'} dk)
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: '700',
                        background: ride.ride_type === 'instant' ? 'rgba(250, 204, 21, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                        color: ride.ride_type === 'instant' ? 'var(--primary)' : 'var(--purple)',
                      }}
                    >
                      {ride.ride_type === 'instant' ? 'ANLIK ÇAĞRI' : 'RANDEVU'} ({ride.status.toUpperCase()})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WHATSAPP SIMULATOR */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px', color: 'var(--whatsapp)' }}>
              📲 WhatsApp Webhook Canlı Simülatörü
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px' }}>
              WhatsApp Cloud API&apos;den gelen gerçek JSON webhook paketini simüle edin.
            </p>

            <form onSubmit={handleSimulate}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  MESAJ TİPİ
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSimType('location')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: simType === 'location' ? 'var(--emerald)' : 'var(--border)',
                      background: simType === 'location' ? 'var(--emerald-glow)' : 'transparent',
                      color: simType === 'location' ? 'var(--emerald)' : 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    📍 Konum (Modül 1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimType('text')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: simType === 'text' ? 'var(--blue)' : 'var(--border)',
                      background: simType === 'text' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                      color: simType === 'text' ? 'var(--blue)' : 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    💬 Metin / Randevu / RAG
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '14px', display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setSimChannel('whatsapp')} style={{ flex: 1, padding: 8, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: simChannel === 'whatsapp' ? '#25d366' : 'var(--border)', background: simChannel === 'whatsapp' ? 'rgba(37,211,102,0.15)' : 'transparent', color: '#fff', fontWeight: 700 }}>WhatsApp</button>
                <button type="button" onClick={() => setSimChannel('telegram')} style={{ flex: 1, padding: 8, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: simChannel === 'telegram' ? '#38bdf8' : 'var(--border)', background: simChannel === 'telegram' ? 'rgba(56,189,248,0.15)' : 'transparent', color: '#fff', fontWeight: 700 }}>Telegram</button>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  YOLCU TELEFON / TELEGRAM ID
                </label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border)',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              {simType === 'location' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                      ENLEM (LAT)
                    </label>
                    <input
                      type="text"
                      value={simLat}
                      onChange={(e) => setSimLat(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid var(--border)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                      BOYLAM (LNG)
                    </label>
                    <input
                      type="text"
                      value={simLng}
                      onChange={(e) => setSimLng(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid var(--border)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                    WHATSAPP MESAJ METNİ
                  </label>
                  <textarea
                    rows={3}
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    placeholder="Örn: 'Yarın saat 15:00 için taksi' veya 'Taksimetre açılış kaç TL?'"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid var(--border)',
                      color: '#fff',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      resize: 'none',
                    }}
                  />
                  {/* Preset quick test buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSimText('Yarın saat 15:00 Ataşehir randevu');
                        setSimLat('40.9923');
                        setSimLng('29.1278');
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      📅 Yarın 15:00 Ataşehir
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimText('Taksimetre açılış ve km ücreti nedir?')}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      💰 Tarife Sorusu (RAG)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimText('Evcil kedi ile binebilir miyim?')}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      🐱 Pet Kuralı (RAG)
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={simLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px -4px rgba(37, 211, 102, 0.4)',
                  opacity: simLoading ? 0.7 : 1,
                }}
              >
                {simLoading ? 'İşleniyor...' : '⚡ Webhook Gönder & Akışı Test Et'}
              </button>
            </form>
          </div>

          {/* Right: Simulation Output */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px' }}>
              🔍 Webhook & LLM Strict JSON Yanıt İzleyicisi
            </h2>

            {simResult ? (
              <pre
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  padding: '16px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#38bdf8',
                  overflowX: 'auto',
                  border: '1px solid var(--border)',
                  maxHeight: '450px',
                }}
              >
                {JSON.stringify(simResult, null, 2)}
              </pre>
            ) : (
              <div
                style={{
                  height: '350px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  textAlign: 'center',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '32px' }}>📡</span>
                Sol panelden WhatsApp konumu veya mesajı gönderdiğinizde,
                <br />
                Rails 8 API yanıtı ve strict JSON sözleşmesi burada görüntülenecektir.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: RAG & DURAK RULES */}
      {activeTab === 'rag' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>🧠 RAG Veri Tabanı & Deterministik Doğrulama</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              LLM modelinin uydurmasını (hallucination) önleyen kurallar ve resmi taksimetre tarifeleri.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px' }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  padding: '18px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--primary)' }}>{rule.title}</h3>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(168, 85, 247, 0.15)',
                      color: 'var(--purple)',
                      fontWeight: '700',
                    }}
                  >
                    {rule.category}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6, marginBottom: '10px' }}>
                  {rule.content}
                </p>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  <strong>RAG Anahtar Kelimeler:</strong> {rule.keywords}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
