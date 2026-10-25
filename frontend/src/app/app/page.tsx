'use client';

import React, { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { loadTelegramSDK, initTelegramWebApp } from '@/lib/miniapp';
import PassengerMiniApp from '@/components/PassengerMiniApp';
import DriverMiniApp from '@/components/DriverMiniApp';

interface Profile {
  id: number; name: string; phone: string; plate?: string; status?: string;
  telegram_id?: string | null; last_latitude?: number | null; last_longitude?: number | null; channel?: string;
}

export default function TelegramMiniAppShell() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<'driver' | 'passenger' | null>(null);
  const [tg, setTg] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      await loadTelegramSDK();
      const { initData, user } = initTelegramWebApp();
      const inTelegram = Boolean(initData) || Boolean(user?.id);

      if (inTelegram) {
        // 1. HMAC imzalı initData ile backend'e sor (şoför mü, yolcu mu?)
        const payload: Record<string, unknown> = {};
        if (initData) payload.init_data = initData;
        if (user?.id) {
          payload.telegram_id = user.id;
          payload.name = user.name;
        }

        const res = await fetch(`${API_URL}/api/v1/auth/telegram_init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => null);

        const data = await res?.json().catch(() => null);
        if (res?.ok && data?.role) {
          setRole(data.role);
          setProfile(data.profile);
          setTg(true);
          setBooting(false);
          return;
        }

        // Eğer backend erişilemedi ama user verisi geldiyse, en azından yolcu modunda aç
        if (user?.id) {
          setRole('passenger');
          setProfile({
            id: user.id,
            name: user.name || `Kullanıcı ${user.id}`,
            phone: `tg_${user.id}`,
            telegram_id: String(user.id),
            channel: 'telegram'
          });
          setTg(true);
          setBooting(false);
          return;
        }
      }

      // Telegram dışı test/tarayıcı girişi: localStorage'dan rol seç
      const savedDriver = localStorage.getItem('driver');
      const savedPassenger = localStorage.getItem('passenger');
      if (savedDriver) {
        setRole('driver');
        setProfile(JSON.parse(savedDriver));
      } else if (savedPassenger) {
        setRole('passenger');
        setProfile(JSON.parse(savedPassenger));
      }
      setBooting(false);
    })();
  }, []);

  if (booting) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)' }}>🚕 Yükleniyor...</div>;
  }

  if (!profile || !role) {
    return (
      <div className="glass-panel" style={{ margin: 16, padding: 20, textAlign: 'center' }}>
        <h2 style={{ fontWeight: 800 }}>🚕 Gadis Taxi Mini App</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
          Bu panel Telegram botundan açılmalıdır. Bota "şoför" yazın ya da yolcuysanız "taksi istiyorum" yazın, Mini App bağlantısı size özel gelir.
        </p>
      </div>
    );
  }

  return role === 'driver'
    ? <DriverMiniApp profile={profile} tg={tg} />
    : <PassengerMiniApp profile={profile} tg={tg} />;
}
