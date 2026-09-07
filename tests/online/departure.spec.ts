import { expect, test, type Page } from '@playwright/test';

async function enterRoom(host: Page, guest: Page) {
  for (const [page, name] of [[host, 'Leaving Captain'], [guest, 'Remaining Racer']] as const) {
    await page.goto('/');
    await page.locator('#title-start-button').click();
    await page.locator('#mode-online-button').click();
    await page.locator('#online-name').fill(name);
  }
  await host.locator('#online-create').click();
  await expect(host.locator('#online-room-code')).toHaveText(/^[A-HJ-NP-Z2-9]{8}$/);
  await guest.locator('#online-code').fill(await host.locator('#online-room-code').innerText());
  await guest.locator('#online-join').click();
  await expect(host.locator('#online-players li')).toHaveCount(2);
}

async function startRace(host: Page, guest: Page) {
  await enterRoom(host, guest);
  await host.locator('#online-ready').click();
  await guest.locator('#online-ready').click();
  await host.locator('#online-start').click();
  await guest.waitForFunction(() => window.__AQUA_ONLINE__?.state.phase === 'racing');
  await host.waitForFunction(() => window.__AQUA_ONLINE__?.state.phase === 'racing');
}

test('leaving a live race clearly notifies the remaining player and explains solo continuation', async ({ page, browser, baseURL }, testInfo) => {
  const host = await browser.newPage({ baseURL });
  try {
    await startRace(host, page);
    const matchId = await page.evaluate(() => window.__AQUA_ONLINE__!.state.matchId);
    await host.locator('#online-race-leave').click();
    await expect(page.locator('#online-race-notice')).toContainText('Leaving Captain left the race.');
    await expect(page.locator('#online-race-notice')).toBeVisible();
    await expect(page.locator('#online-race-notice')).toContainText('You are now the host.');
    await expect(page.locator('#online-race-status')).toContainText('All opponents have left');
    await expect(page.locator('#online-standings li').filter({ hasText: 'Leaving Captain' })).toContainText('Left race (DNF)');
    const tick = await page.evaluate(() => window.__AQUA_ONLINE__!.state.race!.tick);
    await page.waitForFunction((tick) => window.__AQUA_ONLINE__!.state.race!.tick > tick + 12, tick);
    expect(await page.evaluate(() => window.__AQUA_ONLINE__!.state.matchId)).toBe(matchId);
    await expect(page.locator('#online-race-notice')).toContainText('Leaving Captain left the race.');
    await page.screenshot({ path: `artifacts/departure-${testInfo.project.name}.png` });
  } finally {
    await host.close();
    if (await page.locator('#online-race-leave').isVisible()) await page.locator('#online-race-leave').click();
  }
});

test('closing a player tab shows reconnecting first and a departure notice when the grace period expires', async ({ page, browser, baseURL }) => {
  const host = await browser.newPage({ baseURL });
  try {
    await startRace(host, page);
    await host.close();
    await expect(page.locator('#online-race-notice')).toContainText('Leaving Captain disconnected.');
    await expect(page.locator('#online-race-notice')).toBeVisible();
    await expect(page.locator('#online-race-notice')).toContainText('15 seconds');
    await expect(page.locator('#online-standings li').filter({ hasText: 'Leaving Captain' })).toContainText('Reconnecting');
    await expect(page.locator('#online-race-notice')).toContainText('Leaving Captain did not reconnect', { timeout: 22_000 });
    await expect(page.locator('#online-race-status')).toContainText('All opponents have left');
    await expect(page.locator('#online-standings li').filter({ hasText: 'Leaving Captain' })).toContainText('Left race (DNF)');
  } finally {
    await host.close();
    if (await page.locator('#online-race-leave').isVisible()) await page.locator('#online-race-leave').click();
  }
});

test('a lobby departure is announced in the dialog with the new host', async ({ page, browser, baseURL }) => {
  const host = await browser.newPage({ baseURL });
  try {
    await enterRoom(host, page);
    await host.locator('#online-leave').click();
    await expect(page.locator('#online-room-notice')).toContainText('Leaving Captain left the room.');
    await expect(page.locator('#online-room-notice')).toBeVisible();
    await expect(page.locator('#online-room-notice')).toContainText('You are now the host.');
    await expect(page.locator('#online-players li')).toHaveCount(1);
    await expect(page.locator('#online-start')).toBeDisabled();
  } finally {
    await host.close();
    if (await page.locator('#online-leave').isVisible()) await page.locator('#online-leave').click();
  }
});
