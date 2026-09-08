import type { LandmarkDefinition } from './ContentCatalog';

/** Same local footprints drive the visible foundations and collision proxies. */
export function landmarkFootprints(kind: NonNullable<LandmarkDefinition['kind']>) {
  if (kind === 'cargo') return [-12, 12].flatMap(x => [-18, -9, 0, 9, 18].map(z => (
    { x, z, radius: 5, height: 8 }
  )));
  if (kind === 'volcano') return [{ x: 0, z: 0, radius: 22, height: 32 }];
  return [{ x: 0, z: 0, radius: 2.6, height: 3 }];
}
