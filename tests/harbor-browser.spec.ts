import { expect, test, type Page } from '@playwright/test';
import { RaceTrack } from '../src/game/Track';
import { getTrackDefinition } from '../src/game/ContentCatalog';
import { routeCurve } from '../src/game/RouteOptions';
import { captureRuntimeErrors, expectNoRuntimeErrors, waitForRaceGame } from './race-test-helpers';

async function drive(page: Page, stopInFlow: boolean) {
  const track = new RaceTrack(getTrackDefinition('neon-leviathan'));
  const route = routeCurve(track, track.definition.routes!.find(r => r.kind === 'current')!);
  return page.evaluate(({ points, stopInFlow }) => {
    const key = (code: string, down: boolean) => document.body.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    for (const code of ['KeyW', 'KeyA', 'KeyD']) key(code, false);
    let previous = '';
    key('KeyW', true);
    for (let step = 0; step < 2400; step++) {
      const d = window.__THREE_GAME_DIAGNOSTICS__!;
      if (d.state === 'finished' || (stopInFlow && document.querySelector('#course-feature strong')?.textContent?.includes('借流中'))) break;
      let target = d.track.lookAheadPosition;
      if (d.track.progress > .49 && d.track.progress < .635) {
        let nearest = 0, best = Infinity;
        points.forEach((point, i) => {
          const distance = Math.hypot(point.x - d.player.position.x, point.z - d.player.position.z);
          if (distance < best) { nearest = i; best = distance; }
        });
        target = points[Math.min(points.length - 1, nearest + 12)];
      }
      const angle = Math.atan2(target.x - d.player.position.x, -(target.z - d.player.position.z)) - d.player.heading;
      const error = Math.atan2(Math.sin(angle), Math.cos(angle));
      const steer = error > .04 ? 'KeyD' : error < -.04 ? 'KeyA' : '';
      if (steer !== previous) { if (previous) key(previous, false); if (steer) key(steer, true); previous = steer; }
      key('KeyW', Math.abs(error) < .65 || d.player.speed < 9);
      window.advanceTime!(100);
    }
    for (const code of ['KeyW', 'KeyA', 'KeyD']) key(code, false);
    return window.__THREE_GAME_DIAGNOSTICS__!;
  }, { points: route.getSpacedPoints(150).map(p => ({ x: p.x, z: p.z })), stopInFlow });
}

test('harbor driver can choose the current line, read the flow cue, and finish all three laps', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors = captureRuntimeErrors(page);
  await waitForRaceGame(page);
  await page.locator('#title-start-button').click();
  await page.locator('#mode-time-trial-button').click();
  await expect(page.locator('.course-card').first()).toHaveAttribute('data-track', 'neon-leviathan');
  await page.locator('#course-neon-leviathan-button').click();
  await page.evaluate(() => window.advanceTime!(3100));
  await page.screenshot({ path: `artifacts/harbor-start-${info.project.name}.png` });
  const entering = await drive(page, true);
  await expect(page.locator('#course-feature strong')).toContainText('借流中');
  expect(entering.recovery.count).toBe(0);
  await page.screenshot({ path: `artifacts/harbor-current-${info.project.name}.png` });
  const finished = await drive(page, false);
  expect(finished.state).toBe('finished');
  expect(finished.score).toBe(36);
  expect(finished.recovery.count).toBe(0);
  expectNoRuntimeErrors(errors);
  await info.attach('harbor-current-race', { body: JSON.stringify({ entering, finished }, null, 2), contentType: 'application/json' });
});
