export type ChatWsInboundEvent =
  | { type: 'token'; threadId: string; delta: string }
  | { type: 'done'; threadId: string }
  | { type: 'error'; threadId?: string; message: string }
  | { type: string; [key: string]: unknown };

export interface StreamOverWsArgs {
  wsUrl: string;
  payload: unknown;
  onEvent: (event: ChatWsInboundEvent) => void;
}

export function streamOverWs({ wsUrl, payload, onEvent }: StreamOverWsArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const ws = new WebSocket(wsUrl);

    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (err) reject(err);
      else resolve();
    };

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        finish(err);
      }
    };

    ws.onerror = () => {
      finish(new Error('WebSocket connection error'));
    };

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as ChatWsInboundEvent;
        onEvent(event);

        if (event?.type === 'done') {
          finish();
        }
        if (event?.type === 'error') {
          finish(new Error(event.message || 'Unknown error'));
        }
      } catch (err) {
        finish(err);
      }
    };

    ws.onclose = () => {
      if (!settled) {
        finish(new Error('WebSocket closed unexpectedly'));
      }
    };
  });
}
