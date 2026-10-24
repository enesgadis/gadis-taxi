import { useEffect, useState } from 'react';
import { API_URL } from './api';

interface RouteResult {
  coordinates: [number, number][] | null;
  distance_km: number | null;
  duration_min: number | null;
}

const routeCache = new Map<string, RouteResult>();

/**
 * OSRM tabanlı gerçek karayolu rotasını backend Statistics proxy'sinden
 * getirir. Backend .env'e Google/Mapbox anahtarı gerekmez. 30 sn cache.
 */
export function useRealRoute(
  from?: { lat: number; lng: number } | null,
  to?: { lat: number; lng: number } | null
): RouteResult {
  const [route, setRoute] = useState<RouteResult>({ coordinates: null, distance_km: null, duration_min: null });

  useEffect(() => {
    if (!from || !to || !from.lat || !to.lat) return;

    // Yaklaşık 400m'den yakın noktalar için rota hesaplamaya gerek yok
    const dLat = Math.abs(from.lat - to.lat);
    const dLng = Math.abs(from.lng - to.lng);
    if (dLat < 0.003 && dLng < 0.003) {
      setRoute({ coordinates: [[from.lat, from.lng], [to.lat, to.lng]], distance_km: null, duration_min: null });
      return;
    }

    const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}-${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
    const cached = routeCache.get(key);
    if (cached) {
      setRoute(cached);
      return;
    }

    let cancelled = false;
    fetch(`${API_URL}/api/v1/routing/route?start_lat=${from.lat}&start_lng=${from.lng}&end_lat=${to.lat}&end_lng=${to.lng}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json) => {
        const result: RouteResult = {
          coordinates: json.coordinates ?? null,
          distance_km: json.distance_km ?? null,
          duration_min: json.duration_min ?? null,
        };
        routeCache.set(key, result);
        if (!cancelled) setRoute(result);
      })
      .catch(() => {
        if (!cancelled) setRoute({ coordinates: null, distance_km: null, duration_min: null });
      });
    return () => {
      cancelled = true;
    };
  }, [from?.lat, from?.lng, to?.lat, to?.lng]);

  return route;
}
