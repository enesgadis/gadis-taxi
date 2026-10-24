'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { API_URL } from '@/lib/api';
import { initTelegramWebApp, loadTelegramSDK, haptic } from '@/lib/miniapp';
import { apiGet, apiPost } from '@/lib/api';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

interface Profile { id: number; name: string; phone: string; plate?: string; status?: string }

interface Taxi {
  id: number; name: string; plate: string; phone: string; status: string;
  latitude: number; longitude: number; distance_km?: number;
}
interface Pickup {
  ride_id: number; passenger_name: string; passenger_phone: string;
  pickup_lat: number; pickup_lng: number; status: string;
  ride_type: string; scheduled_at?: string; dropoff_address?: string;
}
interface Request {
  id: number; passenger_name: string; passenger_phone: string;
  pickup_lat: number; pickup_lng: number; dropoff_address?: string;
  status: string; ride_type: string; scheduled_at?: string;
  distance_to_pickup_km: number; is_assigned_to_me: boolean;
}

const TABS_P = [
  { key: 'taksi', label: '🚕 Taksi' },
  { key: 'randevu', label: '📅 Randevu' },
  { key: 'harita', label: '🗺️ Harita' },
  { key: 'sikayet', label: '🚨 Şikayet' },
] as const;

// Kanal-farkındalıklı iletişim: karşı taraf Telegram'daysa Telegram, WhatsApp'taysa
// WhatsApp üzerinden botta aracılığıyla mesaj gider; sohbete kendi kanalında devam edersiniz.
interface ContactTarget {
  name: string;
  body: { sender_role: 'passenger' | 'driver'; sender_id: number; target_driver_id?: number; ride_id?: number };
}
function SendMessageBox({ target, onClose }: { target: ContactTarget; onClose: () => void }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const send = async () => {
    if (!text.trim()) return;
    const d = await apiPost<{ success?: boolean; channel?: string; error?: string }>('/api/v1/messages/relay', {
      ...target.body, text, is_first_message: true,
    });
    if (d?.success) { setSent(`✅ Mesajın ${d.channel === 'telegram' ? 'Telegram' : 'WhatsApp'} üzerinden iletildi. Bota yazarak devam edebilirsin!`); haptic('medium'); setTimeout(onClose, 2600); }
    else setSent(`⚠️ ${d?.error || 'Gönderilemedi'}`);
  };
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'var(--surface, #0b0f19)', borderTop: '1px solid var(--border)', padding: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{target.name} ile iletişim</strong>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mesajınız... (karşı tarafın kanalından gider)"
          style={{ flex: 1, padding: 10, borderRadius: 10, background: '#000', color: '#fff', border: '1px solid var(--border)', fontSize: 13 }}
        />
        <button onClick={send} style={{ padding: '10px 16px', borderRadius: 10, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Gönder</button>
      </div>
      {sent && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--emerald)' }}>{sent}</div>}
    </div>
  );
}
const TABS_D = [
  { key: 'cagrilar', label: '📢 Çağrılar' },
  { key: 'randevular', label: '📅 Randevular' },
  { key: 'harita', label: '🗺️ Harita' },
] as const;

export default function PassPanel({ profile, tg }: { profile: Profile; tg: boolean }) {
  const [tab, setTab] = useState<string>('taksi');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [taxis, setTaxis] = useState<Taxi[]>([]);
  const [service, setService] = useState<'taxi' | 'courier' | 'transfer'>('taxi');
  const [msg, setMsg] = useState('');
  const [ride, setRide] = useState<{ id: number } | null>(null);
  const [apTime, setApTime] = useState('');
  const [apAddr, setApAddr] = useState('');
  const [compText, setCompText] = useState('');
  const [compResult, setCompResult] = useState<{ reply?: string; category?: string; severity?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<ContactTarget | null>(null);

  const contactDriver = (d: { id: number; name: string }) => {
    setContact({ name: d.name, body: { sender_role: 'passenger', sender_id: profile.id, target_driver_id: d.id } });
  };

  // Konum çek
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); },
      () => {}
    );
  }, []);

  // last koordinatlar varsa profil üzerinden getir (backend'e kaydedilmiş)
  useEffect(() => {
    let done = false;
    if (lat === null) {
      // profil last_latitude/last_longitude'den al
      apiPost<any>('/api/v1/auth/passenger', { phone: profile.phone, name: profile.name, telegram_id: (profile as any).telegram_id }).then((d) => {
        if (!done && d?.passenger?.last_latitude) { setLat(d.passenger.last_latitude); setLng(d.passenger.last_longitude); }
      });
    }
    return () => { done = true; };
  }, [lat]);

  const refresh = async () => {
    const la = lat ?? 41.037; const ln = lng ?? 28.985;
    const d = await apiGet<{ taxis?: Taxi[]; pickups?: Pickup[] }>(`/api/v1/tracking/map?lat=${la}&lng=${ln}`);
    setTaxis(d?.taxis || []);
    return d?.pickups || [];
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [lat, lng]);

  const callNow = async () => {
    if (lat == null) { setMsg('🚫 Önce konum izni verin.'); return; }
    haptic('medium');
    setLoading(true);
    const d = await apiPost<{ success?: boolean; ride?: { id: number }; error?: string }>('/api/v1/rides/instant', {
      passenger_id: profile.id, latitude: lat, longitude: lng, pickup_address: 'Canlı konum', service,
    });
    setLoading(false);
    if (d?.ride) { setRide(d.ride); setMsg(service === 'courier' ? `📦 Kurye görevlendirildi! Talep #${d.ride.id}` : service === 'transfer' ? `🛬 Transfer ayarlandı! Talep #${d.ride.id}` : `🚕 Taksi çağrıldı! Talep #${d.ride.id}`); }
    else { setMsg(d?.error || '⚠️ Uygun taksi bulunamadı.'); }
  };

  const book = async () => {
    if (!apTime) { setMsg('🚫 Saat seçin.'); return; }
    setLoading(true);
    const d = await apiPost<{ success?: boolean; ride?: { id: number }; error?: string }>('/api/v1/rides/schedule', {
      passenger_id: profile.id, latitude: lat ?? 41.037, longitude: lng ?? 28.985,
      text: `${apTime} ${apAddr} randevu`, pickup_address: apAddr || 'Bilinen konum',
    });
    setLoading(false);
    if (d?.ride) { setMsg(`📅 Randevu #${d.ride.id} kaydedildi — 1 saat önce hatırlatacağız.`); }
    else setMsg(d?.error || '⚠️ Randevu kaydedilemedi.');
  };

  const sendComplaint = async () => {
    if (!compText.trim()) { setMsg('Şikayet yazın.'); return; }
    setLoading(true);
    const d = await apiPost<{ reply?: string; category?: string; severity?: number }>('/api/v1/assistant/complaint', {
      role: 'passenger', profile_id: profile.id, text: compText,
    });
    setLoading(false);
    setCompResult(d);
    if (d?.reply) haptic('heavy');
  };

  return (
    <div>
      <div className="glass-panel" style={{ margin: 12, padding: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>🚕 Merhaba, {profile.name}!</h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {lat ? '📍 Konum alındı' : '📍 Konum bekleniyor...'} {taxis.length > 0 ? `• ${taxis.length} aktif taksi çevrede` : ''}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '0 12px' }}>
        {TABS_P.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); haptic(); }}
            style={{
              flex: 1, padding: 10, border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: tab === t.key ? '#facc15' : 'var(--surface)',
              color: tab === t.key ? '#000' : '#fff',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 12 }}>
        {tab === 'taksi' && (
          <div className="glass-panel" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Ne istiyorsun?</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {([['taxi', '🚕 Taksi'], ['courier', '📦 Kurye'], ['transfer', '🛬 Transfer']] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setService(k)}
                  style={{ flex: 1, padding: 10, border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: service === k ? '#facc15' : 'var(--surface)', color: service === k ? '#000' : '#fff' }}
                >{l}</button>
              ))}
            </div>
            <button
              onClick={callNow}
              disabled={loading}
              style={{ width: '100%', padding: 18, border: 'none', borderRadius: 14, background: '#facc15', color: '#000', fontWeight: 900, fontSize: 18, cursor: 'pointer' }}
            >
              {loading ? 'Aranıyor...' : service === 'courier' ? '📦 ŞİMDİ KURYE İSTE' : service === 'transfer' ? '🛬 ŞİMDİ TRANSFER İSTE' : '🚕 ŞİMDİ TAKSİ İSTE'}
            </button>
            {ride && (
              <a href={`/track/${ride.id}`} style={{ display: 'block', marginTop: 8, color: '#38bdf8' }}>
                Takibini aç → Talep #{ride.id}
              </a>
            )}
            <div style={{ marginTop: 14, fontSize: 13 }}>
              <strong>Yakınındaki taksiler:</strong>
              {taxis.slice(0, 5).map((t) => (
                <div key={t.id} style={{ marginTop: 6, padding: 10, border: '1px solid var(--border)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🚕 {t.name} <small>({t.plate})</small></span>
                  <button
                    onClick={() => contactDriver(t)}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ✉️ Yaz
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'randevu' && (
          <div className="glass-panel" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>📅 Randevu Oluştur</h2>
            <input
              type="datetime-local"
              value={apTime}
              onChange={(e) => setApTime(e.target.value)}
              style={{ width: '100%', padding: 10, marginTop: 8, background: '#000', color: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <input
              placeholder="Adres (ör: Ataşehir)"
              value={apAddr}
              onChange={(e) => setApAddr(e.target.value)}
              style={{ width: '100%', padding: 10, marginTop: 8, background: '#000', color: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <button
              onClick={book}
              disabled={loading}
              style={{ width: '100%', padding: 14, marginTop: 12, border: 'none', borderRadius: 12, background: '#38bdf8', color: '#000', fontWeight: 900, cursor: 'pointer' }}
            >
              {loading ? 'Kaydediliyor...' : '📅 RANDevu Oluştur'}
            </button>
          </div>
        )}

        {tab === 'harita' && (
          <div className="glass-panel" style={{ padding: 10, gap: 8 }}>
            <div style={{ height: 340 }}>
              <LiveMap
                pickupPos={lat !== null ? { lat, lng: lng!, label: 'Konumunuz' } : undefined}
                otherTaxis={taxis.map((t) => ({ lat: t.latitude, lng: t.longitude, name: t.name, plate: t.plate, phone: t.phone }))}
                onTaxiAction={(t) => {
                  const d = taxis.find((x) => x.name === t.name);
                  if (d) contactDriver(d);
                }}
                showRoute={false}
                fitOnce={true}
                zoom={13}
              />
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              {taxis.slice(0, 8).map((t) => (
                <div key={t.id} style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>🚕 <strong>{t.name}</strong> {t.plate} {t.status === 'available' ? '• Boş' : '• Meşgul'}</span>
                  <button onClick={() => contactDriver(t)} style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', fontWeight: 700 }}>✉️ Yaz</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'sikayet' && (
          <div className="glass-panel" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>🚨 Şikayet / Geri Bildirim</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Yazınızdaki her şeyi AI değerlendirir: gereksiz turlatma, fazla ücret, kaba davranış, gecikme, güvenlik vs.
            </p>
            <textarea
              rows={5}
              value={compText}
              onChange={(e) => setCompText(e.target.value)}
              placeholder="Örn: Şoför gereksiz gezdirdi, 80 TL yerine 160 TL aldı..."
              style={{ width: '100%', padding: 10, marginTop: 8, background: '#000', color: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}
            />
            <button
              onClick={sendComplaint}
              disabled={loading}
              style={{ width: '100%', padding: 14, marginTop: 12, border: 'none', borderRadius: 12, background: '#ef4444', color: '#fff', fontWeight: 900, cursor: 'pointer' }}
            >
              {loading ? 'Analiz ediliyor...' : '🤖 AI ile ŞİKAYET GÖNDER'}
            </button>
            {compResult?.reply && (
              <div style={{ marginTop: 14, padding: 12, background: 'var(--surface)', borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>🤖 AI Analiz: <strong>{compResult.category}</strong> • ciddiyet {compResult.severity}/5</div>
                <div style={{ marginTop: 6, fontSize: 13 }}>{compResult.reply}</div>
              </div>
            )}
          </div>
        )}
        {msg && <div style={{ fontSize: 13, color: 'var(--emerald)', padding: 8 }}>{msg}</div>}
      </div>
      {contact && <SendMessageBox target={contact} onClose={() => setContact(null)} />}
      <div style={{ height: 70 }} />
    </div>
  );
}
