import { Vector3 } from 'three';
import type { RaceTrack } from './Track';

export type RampDefinition = Readonly<{ id: string; progress: number; lateralOffset: number; width: number; length: number; height: number; launch: number }>;
export type BlockDefinition = Readonly<{ id: string; progress: number; lateralOffset: number; width: number; length: number; height: number; onRoute?: boolean; style: 'cliff' | 'building' | 'concrete' | 'ruin' }>;
export type ShutterDefinition = Readonly<{ id: string; progress: number; period: number; offset: number }>;
export type WorldBlock = BlockDefinition & { center: Vector3; forward: Vector3; right: Vector3 };
export type WorldRamp = RampDefinition & { center: Vector3; forward: Vector3; right: Vector3 };

export class WorldMechanics {
  readonly ramps: WorldRamp[];
  readonly blocks: WorldBlock[];
  constructor(readonly track: RaceTrack) {
    const transform = (spec: { progress: number; lateralOffset: number }) => ({
      center: track.getOffsetPoint(spec.progress, spec.lateralOffset),
      forward: track.getTangentAt(spec.progress), right: track.getRightAt(spec.progress),
    });
    this.ramps = (track.definition.ramps ?? []).map(spec => ({ ...spec, ...transform(spec) }));
    this.blocks = (track.definition.blocks ?? []).map(spec => ({ ...spec, ...transform(spec) })).filter(block => {
      if (block.onRoute) return true;
      const radius = Math.hypot(block.width, block.length) / 2;
      if (Math.min(...track.points.map(p => p.distanceTo(block.center))) <= radius + 5) return false;
      // Flight carries momentum past a bend. Keep its landing fan clear as well as the water route.
      return this.ramps.every(ramp => {
        const offset = block.center.clone().sub(ramp.center);
        const along = offset.dot(ramp.forward), across = Math.abs(offset.dot(ramp.right));
        return along < -radius || along > 65 + radius || across > ramp.width / 2 + radius + 12;
      });
    });
  }

  /** Deterministic gates always leave a passable center; no player-targeted closing. */
  shutters(time: number): WorldBlock[] {
    return (this.track.definition.shutters ?? []).flatMap(spec => {
      const phase = (time + spec.offset) / spec.period * Math.PI * 2;
      const gap = 4.8 + 8 * (.5 + .5 * Math.sin(phase));
      return [-1, 1].map(side => ({
        id: spec.id + ':' + side, progress: spec.progress, lateralOffset: side * (gap + 2),
        width: 4, length: 5, height: 4, style: 'concrete' as const,
        center: this.track.getOffsetPoint(spec.progress, side * (gap + 2)),
        forward: this.track.getTangentAt(spec.progress), right: this.track.getRightAt(spec.progress),
      }));
    });
  }
}
