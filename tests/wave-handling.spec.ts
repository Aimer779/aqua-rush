import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import type { RaceIntent } from '../src/core/InputController';
import { ArcadeBoat, DEFAULT_PLAYER_TUNING } from '../src/entities/ArcadeBoat';
import { WaveSurface, type GerstnerWave } from '../src/systems/WaveSurface';

const IDLE_INTENT: RaceIntent = { throttle: 0, steer: 0, boost: false };

function waveField(directionX: number, directionZ: number, phase = 0): WaveSurface {
  const waves: readonly GerstnerWave[] = [
    { directionX, directionZ, amplitude: 1, frequency: 0.12, speed: 0, phase, steepness: 0.5 },
    { directionX: 1, directionZ: 0, amplitude: 0, frequency: 0.2, speed: 0, phase: 0, steepness: 0 },
    { directionX: 0, directionZ: 1, amplitude: 0, frequency: 0.3, speed: 0, phase: 0, steepness: 0 },
    { directionX: -1, directionZ: 0, amplitude: 0, frequency: 0.4, speed: 0, phase: 0, steepness: 0 },
  ];
  return new WaveSurface(waves);
}

function racingBoat(id: string): ArcadeBoat {
  const boat = new ArcadeBoat(id, 0xffffff, new THREE.Group());
  boat.reset(new THREE.Vector3(0, 0.42, 0), 0);
  boat.speed = 15;
  boat.velocity.set(0, 0, -15);
  return boat;
}

test.describe('wave-coupled arcade handling', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'Deterministic simulation only needs one JavaScript runtime.');
  });

  test('climbing a swell removes speed while descending returns energy', () => {
    const uphill = racingBoat('uphill-test');
    const downhill = racingBoat('downhill-test');
    try {
      uphill.updateWaterPose(1, 0, waveField(0, -1, 0));
      downhill.updateWaterPose(1, 0, waveField(0, -1, Math.PI));

      expect(uphill.waveHandling.forwardSlope).toBeGreaterThan(0.03);
      expect(uphill.waveHandling.alongAcceleration).toBeLessThan(-0.2);
      expect(downhill.waveHandling.forwardSlope).toBeLessThan(-0.03);
      expect(downhill.waveHandling.alongAcceleration).toBeGreaterThan(0.2);

      uphill.drive(0.25, IDLE_INTENT, DEFAULT_PLAYER_TUNING, true);
      downhill.drive(0.25, IDLE_INTENT, DEFAULT_PLAYER_TUNING, true);
      expect(downhill.speed - uphill.speed).toBeGreaterThan(0.1);
    } finally {
      uphill.dispose();
      downhill.dispose();
    }
  });

  test('cross-swell pushes the hull down the face instead of only rolling the model', () => {
    const boat = racingBoat('cross-swell-test');
    try {
      boat.updateWaterPose(1, 0, waveField(1, 0, 0));
      expect(boat.waveHandling.crossSlope).toBeGreaterThan(0.03);
      expect(boat.waveHandling.lateralAcceleration).toBeLessThan(-0.2);

      boat.drive(0.25, IDLE_INTENT, DEFAULT_PLAYER_TUNING, true);
      expect(boat.velocity.x).toBeLessThan(-0.03);
    } finally {
      boat.dispose();
    }
  });

  test('airborne boats retain arcade control but steer and grip less than a planted hull', () => {
    const planted = racingBoat('planted-test');
    const airborne = racingBoat('airborne-test');
    const steerIntent: RaceIntent = { throttle: 0, steer: 1, boost: false };
    try {
      planted.contact = 1;
      planted.updateWaterPose(1, 0, waveField(0, -1, Math.PI / 2));
      planted.drive(0.1, steerIntent, DEFAULT_PLAYER_TUNING, true);

      airborne.contact = 0;
      airborne.airborne = true;
      airborne.group.position.y = 4;
      airborne.updateWaterPose(0.01, 0, waveField(0, -1, Math.PI / 2));
      airborne.drive(0.1, steerIntent, DEFAULT_PLAYER_TUNING, true);

      expect(airborne.waveHandling.steeringAuthority).toBeLessThan(planted.waveHandling.steeringAuthority);
      expect(airborne.waveHandling.gripScale).toBeLessThan(planted.waveHandling.gripScale);
      expect(Math.abs(airborne.heading)).toBeLessThan(Math.abs(planted.heading));
      expect(Math.abs(airborne.heading)).toBeGreaterThan(0);
    } finally {
      planted.dispose();
      airborne.dispose();
    }
  });
});
