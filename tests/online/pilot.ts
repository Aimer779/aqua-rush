import type { RaceSnapshot } from '../../src/shared/OnlineProtocol';
import type { RaceIntent } from '../../src/shared/RaceIntent';
import { RaceTrack } from '../../src/game/Track';

/** The same checkpoint feedback strategy as the existing keyboard playtest. */
export function pilot(track: RaceTrack, racer: RaceSnapshot['racers'][number], slot: number): RaceIntent {
  const checkpoint = track.getCheckpoint(racer.race.nextCheckpoint);
  const target = checkpoint.center.clone().addScaledVector(checkpoint.right, (slot - 1.5) * 1.6);
  const [x, , z] = racer.body.position;
  const desired = Math.atan2(target.x - x, -(target.z - z));
  const headingError = Math.atan2(Math.sin(desired - racer.body.numbers.heading), Math.cos(desired - racer.body.numbers.heading));
  const speed = Math.abs(racer.body.numbers.speed);
  return {
    steer: Math.max(-1, Math.min(1, headingError * 2.2)),
    throttle: Math.abs(headingError) > .95 && speed > 7 ? -1 : Math.abs(headingError) > .58 && speed > 12 ? 0 : 1,
    boost: false,
  };
}
