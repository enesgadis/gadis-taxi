'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { API_URL } from '@/lib/api';
const API = API_URL;

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+90555');
  const [telegramId, setTelegramId] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'telegram'>('whatsapp');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`${API}/api/v1/auth/passenger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          telegram_id: telegramId || undefined,
          channel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'GiriÅŸ baÅŸarÄ±sÄ±z');
        return;
      }
      localStorage.setItem('passenger', JSON.stringify(data.passenger));
      router.push('/app');
    } catch {
      setErr('API kapalÄ±');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: '80px auto', padding: 20 }}>
      <div className="glass-panel" style={{ padding: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Yolcu giriÅŸi</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 18 }}>
          WhatsApp / Telegram botu uygulama hesabÄ±na baÄŸlanÄ±r
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            required
            placeholder="Ad"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inp}
          />
          <input
            required
            placeholder="Telefon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inp}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setChannel('whatsapp')} style={chip(channel === 'whatsapp')}>
              WhatsApp
            </button>
            <button type="button" onClick={() => setChannel('telegram')} style={chip(channel === 'telegram')}>
              Telegram
            </button>
          </div>
          {channel === 'telegram' && (
            <input
              placeholder="Telegram chat id"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              style={inp}
            />
          )}
          {err && <div style={{ color: '#f87171', fontSize: 13 }}>{err}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              border: 'none',
              background: '#25d366',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {loading ? '...' : 'GiriÅŸ'}
          </button>
        </form>
        <a href="/driver" style={{ display: 'block', marginTop: 16, fontSize: 13, color: 'var(--primary)' }}>
          Taksici giriÅŸi â†’
        </a>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid var(--border)',
  color: '#fff',
  fontSize: 13,
};

function chip(on: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: '1px solid',
    borderColor: on ? 'var(--primary)' : 'var(--border)',
    background: on ? 'var(--primary-glow)' : 'transparent',
    color: on ? 'var(--primary)' : 'var(--text-muted)',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

