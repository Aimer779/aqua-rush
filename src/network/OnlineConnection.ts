import { PROTOCOL_VERSION, RECONNECT_MS, type ClientMessage, type RoomSnapshot, type ServerMessage } from '../shared/OnlineProtocol';

type Seat = { code: string; name: string; token: string };
const SEAT_KEY = 'aqua-rush-online-seat';

export class OnlineConnection {
  playerId = '';
  code = '';
  connected = false;
  rtt = 0;
  private socket: WebSocket | null = null;
  private seat: Seat | null = null;
  private generation = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private disconnectedAt = 0;
  private lastMessageAt = 0;
  private request: AbortController | null = null;

  constructor(
    private readonly onState: (state: RoomSnapshot) => void,
    private readonly onStatus: (message: string, connected: boolean, pending?: boolean) => void,
  ) {}

  async connect(name: string, code?: string): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.playerId = '';
    this.disconnectedAt = 0;
    this.onStatus(code ? 'Joining room…' : 'Creating room…', false, true);
    try {
      if (!code) {
        this.request = new AbortController();
        const response = await fetch('/api/rooms', { method: 'POST', signal: this.request.signal });
        if (!response.ok) throw new Error(response.status === 429 ? 'Too many rooms. Try again in a minute.' : 'Room service is unavailable. Please try again.');
        if (!response.headers.get('Content-Type')?.includes('application/json')) {
          throw new Error('Room service is unavailable here. Open the online game address.');
        }
        const result = await response.json() as { code?: string };
        if (!result.code) throw new Error('The room service returned an invalid response.');
        code = result.code;
      }
      if (generation !== this.generation) return;
      const stored = this.savedSeat();
      this.code = code;
      this.seat = stored?.code === code ? stored : { code, name, token: '' };
      this.open(generation);
    } catch (error) {
      if (generation === this.generation) this.onStatus(error instanceof Error ? error.message : 'Could not connect.', false);
    }
  }

  savedSeat(): Seat | null {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? 'null') as Seat | null;
      return saved && typeof saved.code === 'string' && typeof saved.name === 'string' && typeof saved.token === 'string' ? saved : null;
    } catch { return null; }
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  leave(): void {
    this.send({ type: 'leave' });
    this.stop();
    this.clearSeat();
    this.playerId = '';
  }

  /** Dispose transport on navigation without pretending the user deliberately forfeited. */
  stop(): void {
    this.generation += 1;
    this.request?.abort();
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    if (this.retry !== null) clearTimeout(this.retry);
    this.heartbeat = this.retry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.connected = false;
  }

  private open(generation: number): void {
    if (!this.seat || generation !== this.generation) return;
    const url = new URL(`/api/rooms/${this.code}`, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.socket = socket;
    this.lastMessageAt = performance.now();
    socket.onopen = () => {
      if (this.socket !== socket || !this.seat) return;
      this.send({ type: 'join', version: PROTOCOL_VERSION, name: this.seat.name, token: this.seat.token || undefined });
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      this.lastMessageAt = performance.now();
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
      if (message.type === 'welcome') {
        if (message.version !== PROTOCOL_VERSION) { this.fail('Game version changed. Reload this page.'); return; }
        this.playerId = message.playerId;
        this.seat!.token = message.token;
        try { sessionStorage.setItem(SEAT_KEY, JSON.stringify(this.seat)); } catch { /* Reconnect still works in memory. */ }
        this.connected = true;
        this.disconnectedAt = 0;
        this.onStatus('Connected', true);
      } else if (message.type === 'state') this.onState(message);
      else if (message.type === 'pong') this.rtt = Math.round(performance.now() - message.sentAt);
      else if (message.type === 'error') {
        if (message.fatal) this.fail(message.message);
        else this.onStatus(message.message, this.connected);
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket || generation !== this.generation) return;
      this.connected = false;
      if (!this.seat?.token) { this.fail('Room not found, full, or unavailable. Check the code and try again.'); return; }
      if (!this.disconnectedAt) this.disconnectedAt = performance.now();
      if (performance.now() - this.disconnectedAt >= RECONNECT_MS) { this.fail('Connection lost. Your seat has expired.'); return; }
      this.onStatus('Connection lost — reconnecting…', false, true);
      this.retry = setTimeout(() => this.open(generation), 750);
    };
    socket.onerror = () => { /* onclose handles failed handshakes and reconnection. */ };
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (this.socket !== socket) return;
      if (performance.now() - this.lastMessageAt > 7000) {
        socket.close();
      } else this.send({ type: 'ping', sentAt: performance.now() });
    }, 2000);
  }

  private fail(message: string): void {
    this.stop();
    this.clearSeat();
    this.onStatus(message, false);
  }

  private clearSeat(): void {
    this.seat = null;
    try { sessionStorage.removeItem(SEAT_KEY); } catch { /* Storage may be unavailable. */ }
  }
}
