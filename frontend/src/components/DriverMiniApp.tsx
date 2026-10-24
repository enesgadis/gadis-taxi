'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { apiGet, apiPost } from '@/lib/api';
import { haptic } from '@/lib/miniapp';

const LiveMap = dynamic(() => import('@/components/LiveMap'), { ssr: false });

interface Profile { id: number; name: string; phone: string; plate?: string; status?: string }

interface Profile { id: number; name: string; phone: string; plate?: string; status?: string }

interface Driver {
  id: number; name: string; plate: string; phone: string; status: string;
  latitude: number; longitude: number;
}
interface Request {
  id: number; passenger_name: string; passenger_phone: string;
  pickup_lat: number; pickup_lng: number; dropoff_address?: string;
  status: string; ride_type: string; scheduled_at?: string;
  distance_to_pickup_km: number; is_assigned_to_me: boolean;
}
interface Pickup { ride_id: number; passenger_name: string; passenger_phone: string; pickup_lat: number; pickup_lng: number; status: string; ride_type: string; scheduled_at?: string }

const TABS_D = [
  { key: 'cagrilar', label: '📢 Çağrılar' },
  { key: 'randevular', label: '📅 Randevular' },
  { key: 'harita', label: '🗺️ Harita' },
] as const;

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
          placeholder="Mesajınız... (yolcunun kanalından gider)"
          style={{ flex: 1, padding: 10, borderRadius: 10, background: '#000', color: '#fff', border: '1px solid var(--border)', fontSize: 13 }}
        />
        <button onClick={send} style={{ padding: '10px 16px', borderRadius: 10, background: '#22c55e', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Gönder</button>
      </div>
      {sent && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--emerald)' }}>{sent}</div>}
    </div>
  );
}

export default function DriverMiniApp({ profile, tg }: { profile: Profile; tg: boolean }) {
  const [tab, setTab] = useState<string>('cagrilar');
  const [requests, setRequests] = useState<Request[]>([]);
  const [taxis, setTaxis] = useState<Driver[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [contact, setContact] = useState<ContactTarget | null>(null);

  const contactPassenger = (rideId: number, name: string) => {
    setContact({ name, body: { sender_role: 'driver', sender_id: profile.id, ride_id: rideId } });
  };

  // GPS izleme
  useEffect(() => {
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLat((oldLat) => pos.coords.latitude);
        setLng((oldLng) => pos.coords.longitude);
        apiPost('/api/v1/tracking/update_driver_location', {
          driver_id: profile.id, latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [profile.id]);

  const refresh = async () => {
    const d = await apiGet<{ requests?: Request[] }>(`/api/v1/tracking/driver_portal?driver_id=${profile.id}`);
    setRequests(d?.requests || []);
    const m = await apiGet<{ taxis?: Driver[]; pickups?: Pickup[] }>(`/api/v1/tracking/map`);
    setTaxis(m?.taxis || []);
    setPickups(m?.pickups || []);
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [profile.id]);

  const accept = async (rideId: number) => {
    haptic('medium');
    const d = await apiPost<{ success?: boolean; error?: string; ride?: { id: number } }>('/api/v1/tracking/accept_ride', { driver_id: profile.id, ride_id: rideId });
    if (d?.success) { setMsg(`✅ #${rideId} kabul edildi!`); refresh(); }
    else setMsg(`⚠️ ${d?.error || 'Kabul edilemedi'}`);
  };
  const advance = async (rideId: number, action: 'start' | 'complete' | 'cancel') => {
    haptic('medium');
    const d = await apiPost<{ success?: boolean; error?: string }>('/api/v1/tracking/update_ride_status', { driver_id: profile.id, ride_id: rideId, action_name: action });
    if (d?.success) { setMsg(`✅ #${rideId} durumu: ${action}`); refresh(); }
    else setMsg(`⚠️ ${d?.error || 'İşlem başarısız'}`);
  };

  const calls = requests.filter((r) => ['pending', 'dispatched', 'confirmed'].includes(r.status) && !['scheduled'].includes(r.ride_type));
  const appointments = requests.filter((r) => r.ride_type === 'scheduled');

  return (
    <div>
      <div className="glass-panel" style={{ margin: 12, padding: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900 }}>🚖 {profile.name} • {profile.plate}</h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {lat ? '🛰️ GPS aktif — konum paylaşımda' : '🛰️ Konum izni bekleniyor...'} • {profile.status === 'available' ? '🟢 Boş' : '🔴 Meşgul'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '0 12px' }}>
        {TABS_D.map((t) => (
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 12 }}>
        {tab === 'cagrilar' && (
          calls.length === 0
            ? <div className="glass-panel" style={{ padding: 16 }}>Şu an bekleyen çağrı yok 🚕</div>
            : calls.map((r) => (
              <div key={r.id} className="glass-panel" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 15 }}>#{r.id} {r.passenger_name}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{r.distance_to_pickup_km} km • {r.status}</small>
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text-muted)' }}>📍 {r.dropoff_address || 'Koordinatlı nokta'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => contactPassenger(r.id, r.passenger_name)} style={{ flex: 1, padding: 10, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: '#38bdf8', fontWeight: 700, cursor: 'pointer' }}>
                    ✉️ Yaz
                  </button>
                  {r.status === 'pending' && r.is_assigned_to_me === false && (
                    <button onClick={() => accept(r.id)} style={{ flex: 1, padding: 10, borderRadius: 10, background: '#22c55e', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                      ✅ KABUL ET
                    </button>
                  )}
                  {['dispatched', 'confirmed'].includes(r.status) && (
                    <button onClick={() => advance(r.id, 'start')} style={{ flex: 1, padding: 10, borderRadius: 10, background: '#facc15', color: '#000', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                      🚕 Aldım
                    </button>
                  )}
                  {r.status === 'in_progress' && (
                    <button onClick={() => advance(r.id, 'complete')} style={{ flex: 1, padding: 10, borderRadius: 10, background: '#38bdf8', color: '#000', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                      🏁 Bitti
                    </button>
                  )}
                </div>
              </div>
            ))
        )}

        {tab === 'randevular' && (
          appointments.length === 0
            ? <div className="glass-panel" style={{ padding: 16 }}>Randevu yok 📅</div>
            : appointments.map((r) => (
              <div key={r.id} className="glass-panel" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>#{r.id} {r.passenger_name}</strong>
                  <small style={{ color: 'var(--text-muted)' }}>{r.scheduled_at?.replace('T', ' ').slice(0, 16)}</small>
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: 'var(--text-muted)' }}>📍 {r.dropoff_address || 'Adres'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => accept(r.id)} style={{ flex: 1, padding: 10, borderRadius: 10, background: '#22c55e', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    ✅ KABUL ET
                  </button>
                  <button onClick={() => contactPassenger(r.id, r.passenger_name)} style={{ flex: 1, padding: 10, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: '#38bdf8', fontWeight: 700, cursor: 'pointer' }}>
                    ✉️ Yaz
                  </button>
                </div>
              </div>
            ))
        )}

        {tab === 'harita' && (
          <div className="glass-panel" style={{ padding: 10 }}>
            <div style={{ height: 340 }}>
              <LiveMap
                driverPos={lat !== null ? { lat, lng: lng!, name: profile.name, plate: profile.plate } : undefined}
                otherTaxis={taxis.filter((t) => t.id !== profile.id).map((t) => ({ lat: t.latitude, lng: t.longitude, name: t.name, plate: t.plate }))}
                pickups={pickups.map((p) => ({ lat: p.pickup_lat, lng: p.pickup_lng, label: `${p.passenger_name} • ${p.ride_type === 'instant' ? 'Taksi bekliyor 🚕' : 'Randevu 📅'}`, phone: (p as { passenger_phone?: string }).passenger_phone, ride_id: p.ride_id }))}
                onTaxiAction={() => {
                  // Diğer taksilerle iletişim gerekirse buradan genişletilir
                }}
                onPickupAction={(p, action) => {
                  if (action === 'kabul' && p.ride_id != null) { accept(p.ride_id); return; }
                  contactPassenger(p.ride_id ?? 0, p.label.split('•')[0].trim());
                }}
                showRoute={false}
                fitOnce={true}
                zoom={12}
              />
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              {pickups.slice(0, 8).map((p) => (
                <div key={p.ride_id} style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📍 <strong>{p.passenger_name}</strong> #{p.ride_id} {p.status === 'pending' ? '• bekliyor' : '• atandı'}</span>
                  <button onClick={() => contactPassenger(p.ride_id, p.passenger_name)} style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', fontWeight: 700 }}>
                    ✉️ Yaz
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {msg && <div style={{ fontSize: 13, color: 'var(--emerald)', padding: 8 }}>{msg}</div>}
      </div>
      {contact && <SendMessageBox target={contact} onClose={() => setContact(null)} />}
      <div style={{ height: 70 }} />
    </div>
  );
}
