import { PROTOCOL_VERSION } from '../../src/shared/OnlineProtocol';
import type { ClientMessage, ServerMessage } from '../../src/shared/OnlineProtocol';

export class Peer {
  readonly socket: WebSocket;
  private readonly history: ServerMessage[] = [];
  private readonly listeners = new Set<(message: ServerMessage) => void>();
  private readonly heartbeat: ReturnType<typeof setInterval>;

  constructor(baseURL: string, code: string, name: string, token?: string) {
    const url = new URL(`/api/rooms/${code}`, baseURL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => this.send({ type: 'join', version: PROTOCOL_VERSION, name, token }));
    this.socket.addEventListener('message', (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      this.history.push(message);
      if (this.history.length > 30) this.history.shift();
      for (const listener of this.listeners) listener(message);
    });
    this.heartbeat = setInterval(() => {
      if (this.socket.readyState === WebSocket.OPEN) this.send({ type: 'ping', sentAt: performance.now() });
    }, 2000);
  }

  send(message: ClientMessage): void { this.socket.send(JSON.stringify(message)); }

  wait<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T): Promise<T>;
  wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage>;
  wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const previous = [...this.history].reverse().find(predicate);
    if (previous) return Promise.resolve(previous);
    return new Promise((resolve, reject) => {
      const listener = (message: ServerMessage) => {
        if (!predicate(message)) return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve(message);
      };
      const timeout = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Timed out waiting for peer message. Last: ${JSON.stringify(this.history.at(-1))}`));
      }, 15_000);
      this.listeners.add(listener);
    });
  }

  close(intentional = true): void {
    clearInterval(this.heartbeat);
    if (intentional && this.socket.readyState === WebSocket.OPEN) this.send({ type: 'leave' });
    this.socket.close();
  }
}
