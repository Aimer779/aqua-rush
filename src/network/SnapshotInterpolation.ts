import { Quaternion } from 'three';
import { BOAT_NUMBERS, type BoatState } from '../shared/BoatState';
import { SNAPSHOT_INTERVAL_MS, type RaceSnapshot } from '../shared/OnlineProtocol';

const MIN_BUFFER = SNAPSHOT_INTERVAL_MS * 2 / 1000;
const MAX_BUFFER = .25;
const RESET_GAP = .5;

/** A continuous playback clock absorbs packet jitter instead of restarting each
 * interpolation when a packet arrives. Only remote presentation is delayed. */
export class SnapshotInterpolation {
  private readonly snapshots: RaceSnapshot[] = [];
  private readonly rotation = new Quaternion();
  private readonly targetRotation = new Quaternion();
  private time = 0;
  private updatedAt = 0;
  private receivedAt = 0;
  private jitter = 0;
  private buffer = MIN_BUFFER;
  private starvedMs = 0;

  receive(snapshot: RaceSnapshot, now: number): void {
    const latest = this.snapshots.at(-1);
    if (latest && snapshot.tick <= latest.tick) return;
    if (!latest || now - this.receivedAt > RESET_GAP * 1000) {
      // After suspension/reconnection there is no useful path across the gap.
      this.snapshots.length = 0;
      this.time = snapshot.elapsed - MIN_BUFFER;
      this.updatedAt = now;
      this.jitter = 0;
      this.buffer = MIN_BUFFER;
    } else {
      const variation = Math.abs((now - this.receivedAt) / 1000 - (snapshot.elapsed - latest.elapsed));
      // Grow promptly for jitter, then release the extra delay gradually.
      this.jitter = Math.max(variation, this.jitter * .95);
      this.buffer = Math.min(MAX_BUFFER, MIN_BUFFER + this.jitter * 2);
    }
    this.receivedAt = now;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 32) this.snapshots.shift();
  }

  update(now: number): void {
    const latest = this.snapshots.at(-1);
    if (!latest) return;
    const delta = Math.max(0, (now - this.updatedAt) / 1000);
    if (delta === 0) return;
    this.updatedAt = now;
    // TCP can deliver a long backlog in one burst after an outage. Do not spend
    // seconds slowly replaying that stale history when fresh state is available.
    if (delta > RESET_GAP || latest.elapsed - this.time > RESET_GAP) {
      this.time = Math.max(this.time, latest.elapsed - this.buffer);
    }
    const age = Math.max(0, (now - this.receivedAt) / 1000);
    const target = latest.elapsed + Math.min(age, this.buffer) - this.buffer;
    // Correct clock drift with a small speed change, never a packet-driven jump.
    const speed = Math.max(.95, Math.min(1.05, 1 + (target - this.time) * .5));
    const next = this.time + Math.min(delta, RESET_GAP) * speed;
    if (next > latest.elapsed && latest.phase !== 'finished') this.starvedMs += (next - latest.elapsed) / speed * 1000;
    this.time = Math.min(next, latest.elapsed);
    while (this.snapshots.length > 2 && this.snapshots[1].elapsed <= this.time) this.snapshots.shift();
  }

  body(id: string, now: number): BoatState | null {
    this.update(now);
    const first = this.snapshots[0];
    if (!first) return null;
    let before = first;
    let after = first;
    for (const snapshot of this.snapshots) {
      after = snapshot;
      if (snapshot.elapsed >= this.time) break;
      before = snapshot;
    }
    const from = before.racers.find((racer) => racer.id === id);
    const to = after.racers.find((racer) => racer.id === id);
    if (!from || !to) return to?.body ?? from?.body ?? null;
    if (before === after) return to.body;
    // A recovery is a teleport at its timestamp, not a fast trip through walls.
    if (from.recovery !== to.recovery) return this.time < after.elapsed ? from.body : to.body;
    const duration = after.elapsed - before.elapsed;
    const alpha = Math.max(0, Math.min(1, (this.time - before.elapsed) / duration));
    return this.interpolate(from.body, to.body, alpha, duration);
  }

  diagnostics(now: number) {
    const latest = this.snapshots.at(-1);
    return { bufferMs: this.buffer * 1000, jitterMs: this.jitter * 1000,
      bufferedMs: latest ? Math.max(0, latest.elapsed - this.time) * 1000 : 0,
      snapshotAgeMs: latest ? Math.max(0, now - this.receivedAt) : 0,
      starvedMs: this.starvedMs };
  }

  private interpolate(from: BoatState, to: BoatState, alpha: number, duration: number): BoatState {
    const mix = (a: number, b: number) => a + (b - a) * alpha;
    const angle = (a: number, b: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * alpha;
    const position: BoatState['position'] = [0, 0, 0];
    const velocity: BoatState['velocity'] = [0, 0, 0];
    const visualRotation: BoatState['visualRotation'] = [0, 0, 0];
    const a2 = alpha * alpha;
    const a3 = a2 * alpha;
    for (let axis = 0; axis < 3; axis++) {
      const p0 = from.position[axis];
      const p1 = to.position[axis];
      const v0 = axis === 1 ? from.numbers.verticalVelocity : from.velocity[axis];
      const v1 = axis === 1 ? to.numbers.verticalVelocity : to.velocity[axis];
      // Velocity-aware Hermite interpolation smooths turns between 20 Hz samples.
      // Clamp to the segment bounds so collision corrections cannot overshoot.
      const curved = (2 * a3 - 3 * a2 + 1) * p0 + (a3 - 2 * a2 + alpha) * duration * v0
        + (-2 * a3 + 3 * a2) * p1 + (a3 - a2) * duration * v1;
      position[axis] = Math.max(Math.min(p0, p1), Math.min(Math.max(p0, p1), curved));
      velocity[axis] = mix(from.velocity[axis], to.velocity[axis]);
      visualRotation[axis] = angle(from.visualRotation[axis], to.visualRotation[axis]);
    }
    const numbers = { ...from.numbers };
    for (const key of BOAT_NUMBERS) numbers[key] = key === 'heading'
      ? angle(from.numbers[key], to.numbers[key]) : mix(from.numbers[key], to.numbers[key]);
    return { ...from, position, velocity, visualRotation, numbers,
      flags: alpha < 1 ? from.flags : to.flags,
      quaternion: this.rotation.fromArray(from.quaternion)
        .slerp(this.targetRotation.fromArray(to.quaternion), alpha).toArray() };
  }
}
