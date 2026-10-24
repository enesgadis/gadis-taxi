// API taban adresi: çevre değişkeni ile konfigüre edilir, hardcoded localhost yok.
// .env.local -> NEXT_PUBLIC_API_URL=https://... (ör. tünel adresi)
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Backend .env FRONTEND_URL ile birebir aynı default.
export const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error(`GET ${path} hatası:`, err);
    return null;
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return null;
    return json as T;
  } catch (err) {
    console.error(`POST ${path} hatası:`, err);
    return null;
  }
}
