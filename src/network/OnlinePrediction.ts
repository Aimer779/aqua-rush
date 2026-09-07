import { Quaternion, Vector3 } from 'three';
import { ArcadeBoat, DEFAULT_PLAYER_TUNING } from '../entities/ArcadeBoat';
import { getTrackDefinition, type TrackId } from '../game/ContentCatalog';
import { WaveSurface } from '../systems/WaveSurface';
import type { BoatState } from '../shared/BoatState';
import type { RaceIntent } from '../shared/RaceIntent';
import { NEUTRAL_INPUT, SIMULATION_STEP, type ClientMessage, type RaceSnapshot } from '../shared/OnlineProtocol';

type PredictedInput = { seq: number; intent: RaceIntent };

export class OnlinePrediction {
  private readonly boat = new ArcadeBoat('prediction', '#ffcc32', null);
  private readonly waves: WaveSurface;
  private readonly pending: PredictedInput[] = [];
  private readonly correctionOffset = new Vector3();
  private readonly quaternion = new Quaternion();
  private previous: RaceSnapshot | null = null;
  private latest: RaceSnapshot | null = null;
  private receivedAt = 0;
  private sequence = 0;
  private accumulator = 0;
  private recovery = -1;
  private predictedElapsed = 0;
  correction = 0;

  constructor(private readonly playerId: string, trackId: TrackId, private readonly matchId: string,
    private readonly send: (message: ClientMessage) => void, private readonly now = () => performance.now()) {
    this.waves = new WaveSurface(getTrackDefinition(trackId).waves.waves);
  }

  receive(snapshot: RaceSnapshot, now = this.now()): void {
    if (this.latest && snapshot.tick <= this.latest.tick) return;
    const self = snapshot.racers.find((racer) => racer.id === this.playerId);
    if (!self) return;
    const oldPosition = this.boat.group.position.clone();
    const recovered = this.recovery !== self.recovery;
    this.recovery = self.recovery;
    this.previous = this.latest;
    this.latest = snapshot;
    this.receivedAt = now;
    this.boat.restoreState(self.body);
    this.sequence = Math.max(this.sequence, self.ack);
    const remaining = recovered ? [] : this.pending.filter((input) => input.seq > self.ack);
    this.pending.splice(0, this.pending.length, ...remaining);
    this.predictedElapsed = snapshot.elapsed;
    for (const input of this.pending) this.simulate(input.intent);
    this.correction = oldPosition.distanceTo(this.boat.group.position);
    if (!this.previous || recovered || this.correction > 5) this.correctionOffset.set(0, 0, 0);
    else this.correctionOffset.add(oldPosition.sub(this.boat.group.position));
  }

  update(delta: number, intent: RaceIntent, connected: boolean): void {
    if (!this.latest) return;
    this.correctionOffset.multiplyScalar(Math.exp(-12 * delta));
    if (!connected || this.now() - this.receivedAt > 500 || this.latest.phase === 'finished') return;
    this.accumulator += Math.min(delta, 0.1);
    while (this.accumulator >= SIMULATION_STEP) {
      this.accumulator -= SIMULATION_STEP;
      const input = { seq: ++this.sequence, intent: { ...intent } };
      this.pending.push(input);
      if (this.pending.length > 120) this.pending.shift();
      this.simulate(input.intent);
      if (this.sequence % 3 === 0) this.send({ type: 'input', matchId: this.matchId, ...input.intent, seq: input.seq });
    }
  }

  /** Clear held controls immediately when opening a menu or losing browser focus. */
  releaseInput(): void {
    this.sequence += 1;
    this.send({ type: 'input', matchId: this.matchId, seq: this.sequence, ...NEUTRAL_INPUT });
  }

  body(id: string, now = this.now()): BoatState | null {
    if (id === this.playerId) {
      const state = this.boat.captureState();
      state.position = new Vector3(...state.position).add(this.correctionOffset).toArray();
      return state;
    }
    const current = this.latest?.racers.find((racer) => racer.id === id);
    if (!current) return null;
    const old = this.previous?.racers.find((racer) => racer.id === id);
    if (!old || old.recovery !== current.recovery) return current.body;
    const interval = Math.max(1, (this.latest!.elapsed - this.previous!.elapsed) * 1000);
    const alpha = Math.min(1, Math.max(0, (now - this.receivedAt) / interval));
    return {
      ...current.body,
      position: new Vector3(...old.body.position).lerp(new Vector3(...current.body.position), alpha).toArray(),
      quaternion: this.quaternion.fromArray(old.body.quaternion).slerp(new Quaternion(...current.body.quaternion), alpha).toArray(),
    };
  }

  get elapsed(): number { return this.predictedElapsed; }
  dispose(): void { this.boat.dispose(); }

  private simulate(intent: RaceIntent): void {
    this.predictedElapsed += SIMULATION_STEP;
    const self = this.latest?.racers.find((racer) => racer.id === this.playerId);
    this.boat.drive(SIMULATION_STEP, intent, DEFAULT_PLAYER_TUNING, this.latest?.phase === 'racing' && !self?.race.finished);
    this.boat.updateWaterPose(SIMULATION_STEP, this.predictedElapsed, this.waves);
  }
}
