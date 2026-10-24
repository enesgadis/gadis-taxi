// @rails/actioncable istemci paketinin tip tanımı
declare module '@rails/actioncable' {
  export interface CableSubscription {
    unsubscribe: () => void;
    perform: (action: string, data?: Record<string, unknown>) => void;
    send: (data: Record<string, unknown>) => void;
  }
  export interface CableConsumer {
    subscriptions: {
      create: (
        params: { channel: string; [key: string]: unknown },
        callbacks?: {
          received?: (data: unknown) => void;
          connected?: () => void;
          disconnected?: () => void;
          rejected?: () => void;
        }
      ) => CableSubscription;
    };
  }
  export function createConsumer(url?: string): CableConsumer;
  const _default: { createConsumer: typeof createConsumer };
  export default _default;
}
