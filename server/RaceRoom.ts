import { DurableObject } from 'cloudflare:workers';
import { parseClientMessage, PROTOCOL_VERSION, SNAPSHOT_INTERVAL_MS, type ServerMessage } from '../src/shared/OnlineProtocol';
import { RoomSession } from './RoomSession';

type Connection = { playerId: string | null; openedAt: number; windowAt: number; messages: number };
type RoomMetadata = { code: string; expiresAt: number };

export class RaceRoom extends DurableObject<Env> {
  private session: RoomSession | null = null;
  private metadata: RoomMetadata | null = null;
  private readonly connections = new Map<WebSocket, Connection>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDue = 0;
  private lastBroadcast = '';
  private eventMatchId = '';
  private eventSequence = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.metadata = await ctx.storage.get<RoomMetadata>('room') ?? null;
      if (this.metadata && this.metadata.expiresAt > Date.now()) this.session = new RoomSession(this.metadata.code, Date.now());
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path.startsWith('/create/')) {
      if (this.metadata && this.metadata.expiresAt > Date.now()) return new Response('Room exists', { status: 409 });
      const code = path.slice('/create/'.length);
      this.metadata = { code, expiresAt: Date.now() + 3_600_000 };
      await this.ctx.storage.put('room', this.metadata);
      await this.ctx.storage.setAlarm(this.metadata.expiresAt);
      this.session = new RoomSession(code, Date.now());
      return Response.json({ code }, { status: 201 });
    }
    if (!this.session || this.session.closed || !this.metadata || this.metadata.expiresAt <= Date.now()) {
      return new Response('Room not found or expired', { status: 404 });
    }
    if (this.connections.size >= 8) return new Response('Too many connections', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.connections.set(server, { playerId: null, openedAt: Date.now(), windowAt: Date.now(), messages: 0 });
    server.addEventListener('message', (event) => this.receive(server, event.data));
    server.addEventListener('close', () => this.disconnect(server));
    server.addEventListener('error', () => this.disconnect(server));
    this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> { await this.shutdown(); }

  private receive(socket: WebSocket, raw: string | ArrayBuffer): void {
    const connection = this.connections.get(socket);
    const session = this.session;
    if (!connection || !session) return;
    const now = Date.now();
    if (now - connection.windowAt >= 1000) { connection.messages = 0; connection.windowAt = now; }
    if (++connection.messages > 90) { this.reject(socket, 'Too many messages.'); return; }
    const message = parseClientMessage(raw);
    if (!message) { this.reject(socket, 'Invalid message or outdated game version. Reload the page.'); return; }
    if (message.type === 'join') {
      if (connection.playerId) { this.reject(socket, 'Already joined.'); return; }
      try {
        const welcome = session.join(message.name, message.token, now);
        connection.playerId = welcome.playerId;
        this.send(socket, { type: 'welcome', ...welcome, version: PROTOCOL_VERSION });
        this.broadcast(true);
      } catch (error) { this.reject(socket, error instanceof Error ? error.message : 'Could not join.'); }
      return;
    }
    if (!connection.playerId) { this.reject(socket, 'Join a room first.'); return; }
    const error = session.dispatch(connection.playerId, message, now);
    if (error) { this.send(socket, { type: 'error', message: error }); return; }
    if (message.type === 'ping') { this.send(socket, { type: 'pong', sentAt: message.sentAt }); return; }
    if (message.type === 'input') return;
    if (message.type === 'leave') { this.close(socket, 1000, 'Left room'); }
    // Coalesce commands, including valid rapid toggles, into one snapshot tick.
    this.schedule(SNAPSHOT_INTERVAL_MS);
  }

  private broadcast(force = false): void {
    if (!this.session) return;
    const state = this.session.snapshot();
    if (state.matchId !== this.eventMatchId) {
      this.eventMatchId = state.matchId;
      this.eventSequence = 0;
    }
    // WebSockets deliver in order. Durable race state restores reconnecting
    // clients; past sound/notification events do not need to be replayed.
    if (state.race) {
      state.race.events = state.race.events.filter((entry) => entry.id > this.eventSequence);
      this.eventSequence = state.race.events.at(-1)?.id ?? this.eventSequence;
    }
    const encoded = JSON.stringify(state, (_key, value: unknown) =>
      typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 100_000) / 100_000 : value);
    // A rapid reconnect can restore exactly the previous state, but its new
    // socket still needs an initial snapshot.
    if (!force && encoded === this.lastBroadcast) return;
    this.lastBroadcast = encoded;
    for (const [socket, connection] of this.connections) {
      if (!connection.playerId) continue;
      if (!this.session.members.get(connection.playerId)?.connected) { this.close(socket, 4000, 'Connection expired'); continue; }
      try { socket.send(encoded); } catch { this.disconnect(socket); }
    }
  }

  private schedule(requestedDelay = 1000): void {
    const active = this.session?.phase === 'countdown' || this.session?.phase === 'racing';
    const delay = active ? SNAPSHOT_INTERVAL_MS : requestedDelay;
    const due = Date.now() + delay;
    // Incoming messages may bring a tick forward, but cannot postpone it forever.
    if (this.timer !== null && this.timerDue <= due) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timerDue = due;
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = Date.now();
      for (const [socket, connection] of this.connections) {
        if (!connection.playerId && now - connection.openedAt >= 5000) this.reject(socket, 'Join timed out.');
      }
      // A newly opened socket has five seconds to send join before an empty room expires.
      if (this.session && (this.session.members.size > 0 || this.connections.size === 0)) this.session.advance(now);
      if (this.session?.closed) { this.ctx.waitUntil(this.shutdown()); return; }
      this.broadcast();
      this.schedule();
    }, delay);
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    try { socket.send(JSON.stringify(message)); } catch { this.disconnect(socket); }
  }

  private reject(socket: WebSocket, message: string): void {
    this.send(socket, { type: 'error', message, fatal: true });
    this.close(socket, 1008, message.slice(0, 100));
  }

  private close(socket: WebSocket, code: number, reason: string): void {
    this.disconnect(socket);
    try { socket.close(code, reason); } catch { /* The peer may already be closed. */ }
  }

  private disconnect(socket: WebSocket): void {
    const connection = this.connections.get(socket);
    if (!connection) return;
    this.connections.delete(socket);
    if (connection.playerId) this.session?.disconnect(connection.playerId, Date.now());
  }

  private async shutdown(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const socket of this.connections.keys()) this.close(socket, 4001, 'Room expired');
    this.session?.simulation?.dispose();
    this.session = null;
    this.metadata = null;
    await this.ctx.storage.deleteAll();
  }
}
