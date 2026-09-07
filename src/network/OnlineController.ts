import { OnlineConnection } from './OnlineConnection';
import { OnlineLobby } from './OnlineLobby';
import { OnlinePrediction } from './OnlinePrediction';
import type { RaceIntent } from '../shared/RaceIntent';
import type { RoomSnapshot } from '../shared/OnlineProtocol';

type OnlineView = {
  enter: () => void;
  leave: () => void;
  prepare: (snapshot: RoomSnapshot, playerId: string) => void;
  snapshot: (snapshot: RoomSnapshot) => void;
  notice: (message: string) => void;
};

export class OnlineController {
  readonly connection: OnlineConnection;
  latest: RoomSnapshot | null = null;
  prediction: OnlinePrediction | null = null;
  active = false;
  private readonly lobby: OnlineLobby;
  private preparedMatch = '';
  private loadedMatch = '';
  private readonly abort = new AbortController();

  constructor(private readonly view: OnlineView) {
    this.connection = new OnlineConnection(
      (snapshot) => this.receive(snapshot),
      (message, connected, pending) => {
        this.lobby.status(message, connected, pending);
        if (connected) this.loadedMatch = '';
        else this.prediction?.releaseInput();
      },
    );
    this.lobby = new OnlineLobby({
      connect: (name, code) => { void this.connection.connect(name, code); },
      ready: () => this.connection.send({ type: 'ready', ready: !this.latest?.players.find((p) => p.id === this.connection.playerId)?.ready }),
      start: () => this.connection.send({ type: 'start' }),
      track: (trackId) => this.connection.send({ type: 'track', trackId }),
      rematch: () => this.rematch(),
      leave: () => this.leave(),
    }, (message) => this.view.notice(message));
    document.querySelector('#mode-online-button')!.addEventListener('click', () => this.open(), { signal: this.abort.signal });
    window.addEventListener('blur', () => this.prediction?.releaseInput(), { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.prediction?.releaseInput();
    }, { signal: this.abort.signal });
  }

  open(): void {
    this.active = true;
    document.body.classList.add('online-active');
    this.view.enter();
    const saved = this.connection.savedSeat();
    this.lobby.open(saved ? { name: saved.name, code: saved.code } : undefined);
  }

  leave(): void {
    this.connection.leave();
    this.prediction?.dispose();
    this.prediction = null;
    this.latest = null;
    this.preparedMatch = this.loadedMatch = '';
    this.active = false;
    this.lobby.close();
    document.body.classList.remove('online-active');
    window.__AQUA_ONLINE__ = undefined;
    this.view.leave();
  }

  update(delta: number, intent: RaceIntent): void {
    if (!this.active) return;
    if (this.latest?.phase === 'countdown' || this.latest?.phase === 'racing') {
      this.prediction?.update(delta, intent, this.connection.connected && !document.hidden);
    }
    if (window.__AQUA_ONLINE__) {
      window.__AQUA_ONLINE__.connected = this.connection.connected;
      window.__AQUA_ONLINE__.rtt = this.connection.rtt;
      window.__AQUA_ONLINE__.correction = this.prediction?.correction ?? 0;
    }
  }

  rematch(): void {
    if (this.latest?.phase === 'results') this.connection.send({ type: 'rematch' });
    else this.lobby.status('An online race cannot be restarted. Leave the room to forfeit.', this.connection.connected);
  }

  recover(): void {
    if (this.latest) this.connection.send({ type: 'recover', matchId: this.latest.matchId });
  }

  dispose(): void {
    this.abort.abort();
    this.connection.stop();
    this.prediction?.dispose();
    this.lobby.dispose();
  }

  private receive(snapshot: RoomSnapshot): void {
    if (!this.active) return;
    this.latest = snapshot;
    if (snapshot.race && snapshot.matchId !== this.preparedMatch) {
      this.prediction?.dispose();
      this.prediction = new OnlinePrediction(this.connection.playerId, snapshot.trackId, snapshot.matchId, (message) => this.connection.send(message));
      this.preparedMatch = snapshot.matchId;
      this.view.prepare(snapshot, this.connection.playerId);
    }
    if (!snapshot.race) {
      this.prediction?.dispose();
      this.prediction = null;
      this.preparedMatch = this.loadedMatch = '';
    } else this.prediction?.receive(snapshot.race);
    this.view.snapshot(snapshot);
    this.lobby.update(snapshot, this.connection.playerId, this.connection.connected, this.connection.rtt);
    window.__AQUA_ONLINE__ = { state: snapshot, connected: this.connection.connected, rtt: this.connection.rtt, correction: this.prediction?.correction ?? 0 };
    if (snapshot.phase === 'loading' && snapshot.matchId !== this.loadedMatch) {
      this.loadedMatch = snapshot.matchId;
      requestAnimationFrame(() => {
        if (this.active && this.latest?.matchId === snapshot.matchId) this.connection.send({ type: 'loaded', matchId: snapshot.matchId });
      });
    }
  }
}
