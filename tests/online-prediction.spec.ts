import { expect, test } from '@playwright/test';
import { OnlinePrediction } from '../src/network/OnlinePrediction';
import { OnlineSimulation, type AppliedInput } from '../src/shared/OnlineSimulation';
import { SIMULATION_STEP, type ClientMessage, type RaceSnapshot, type RoomPlayer } from '../src/shared/OnlineProtocol';

for (const rtt of [50, 100, 200]) {
  test(`prediction remains bounded with ${rtt}ms RTT and controlled jitter`, () => {
    const player: RoomPlayer = { id: 'captain', name: 'Captain', slot: 0, ready: true, connected: true, dnf: false };
    const simulation = new OnlineSimulation('storm-reef', [player]);
    const boat = simulation.boats.get(player.id)!;
    simulation.race.startImmediately([{ id: boat.id, position: boat.group.position, velocity: boat.velocity }], simulation.track);
    let now = 0;
    let step = 0;
    const halfTrip = Math.round(rtt / 2 / (SIMULATION_STEP * 1000));
    const inputs: Array<{ at: number; message: Extract<ClientMessage, { type: 'input' }> }> = [];
    const snapshots: Array<{ at: number; snapshot: RaceSnapshot }> = [];
    const applied = new Map<string, AppliedInput>();
    const prediction = new OnlinePrediction(player.id, 'storm-reef', 'match', (message) => {
      if (message.type === 'input') inputs.push({ at: step + halfTrip, message });
    }, () => now);
    prediction.receive(simulation.snapshot());
    const corrections: number[] = [];
    for (step = 1; step <= 600; step += 1) {
      now = step * SIMULATION_STEP * 1000;
      prediction.update(SIMULATION_STEP, { throttle: step < 500 ? 1 : 0, steer: Math.sin(step / 100) * 0.2, boost: step > 180 && step < 360 }, true);
      for (let index = inputs.length - 1; index >= 0; index -= 1) {
        const queued = inputs[index];
        if (queued.at > step) continue;
        const message = queued.message;
        if (message.seq > (applied.get(player.id)?.seq ?? 0)) applied.set(player.id, {
          seq: message.seq, intent: { throttle: message.throttle, steer: message.steer, boost: message.boost },
        });
        inputs.splice(index, 1);
      }
      simulation.step(applied);
      if (step % 3 === 0) snapshots.push({ at: step + halfTrip + (step % 9 === 0 ? 2 : 0), snapshot: simulation.snapshot() });
      for (let index = snapshots.length - 1; index >= 0; index -= 1) {
        if (snapshots[index].at > step) continue;
        prediction.receive(snapshots[index].snapshot);
        if (step > 60) corrections.push(prediction.correction);
        snapshots.splice(index, 1);
      }
    }
    corrections.sort((a, b) => a - b);
    expect(corrections[Math.floor(corrections.length * .95)]).toBeLessThan(2);
    expect(prediction.body(player.id)!.position.every(Number.isFinite)).toBe(true);
    prediction.receive({ ...simulation.snapshot(), tick: simulation.tick + 1,
      racers: simulation.snapshot().racers.map((racer) => ({ ...racer, ack: Number.MAX_SAFE_INTEGER, recovery: racer.recovery + 1 })) });
    expect(prediction.body(player.id)!.position).toEqual(boat.captureState().position);
    prediction.dispose();
    simulation.dispose();
  });
}
