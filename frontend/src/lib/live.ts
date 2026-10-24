'use client';

// ActionCable (WebSocket) istemcisi:
// "locations" oda  -> tüm şoför telemetrisi (kokpit, radar)
// "ride_<id>" oda  -> tek yolculuk canlı durumu (takip ekranı)
// Gerçek zamanlı push + polling fallback birlikte kullanılır.
import { createConsumer } from '@rails/actioncable';
import { API_URL } from './api';

let consumer: ReturnType<typeof createConsumer> | null = null;

export function getConsumer() {
  if (!consumer) {
    consumer = createConsumer(`${API_URL}/cable`);
  }
  return consumer;
}

export interface LiveMessage {
  type: 'driver_location' | 'ride_update';
  driver?: Record<string, unknown> | null;
  ride?: Record<string, unknown>;
  ride_id?: number;
  status?: string;
}

/**
 * Odalara abone olup gelen mesajları callback'e iletir.
 * Dönen fonksiyon unsubscribe yapar (useEffect cleanup).
 */
export function subscribeRoom(room: string, onMessage: (msg: LiveMessage) => void): () => void {
  const subscription = getConsumer().subscriptions.create(
    { channel: 'TrackingChannel', room },
    {
      received: (data: unknown) => {
        onMessage(data as LiveMessage);
      },
    }
  );
  return () => subscription.unsubscribe();
}
