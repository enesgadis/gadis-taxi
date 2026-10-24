'use client';

// Telegram Mini App SDK yükleme + initData kimlik akışı.
// Telegram içinde açıldığında initData, tarayıcıda açıldığında null döner.
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string } };
        ready: () => void;
        expand: () => void;
        enableClosingConfirmation: () => void;
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string) => void;
        showPopup?: (params: unknown, cb?: (id: string) => void) => void;
        HapticFeedback?: { impactOccurred: (style: string) => void };
        HeaderButton?: { show: () => void };
      };
    };
  }
}

export function loadTelegramSDK(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp) return resolve();
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

export function initTelegramWebApp(): { initData: string; user: { id: number; name: string } | null } {
  const tg = window.Telegram?.WebApp;
  if (!tg) return { initData: '', user: null };
  try {
    tg.ready();
    tg.expand();
  } catch {}
  const u = tg.initDataUnsafe?.user;
  return {
    initData: tg.initData || '',
    user: u ? { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') } : null,
  };
}

export const isTelegram = () => Boolean(window.Telegram?.WebApp?.initData);

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  } catch {}
}

export function openTelegramLink(url: string) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}
