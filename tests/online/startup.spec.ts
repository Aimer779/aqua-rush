import { expect, test } from '@playwright/test';

test('the first paint shows the start menu while the game script is still downloading', async ({ page }) => {
  let releaseScripts: () => void = () => {};
  const scriptsAllowed = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route('**/assets/*.js', async (route) => {
    await scriptsAllowed;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#title-screen')).toBeVisible();
    await expect(page.locator('#title-start-button')).toHaveText('Start racing');
    await expect(page.locator('#title-start-button')).toBeDisabled();
    await expect(page.locator('#hud')).toBeHidden();
    await expect(page.locator('#touch-controls')).toBeHidden();
  } finally { releaseScripts(); }
  await expect(page.locator('#title-start-button')).toBeEnabled();
  await page.locator('#title-start-button').click();
  await expect(page.locator('#mode-select-screen')).toBeVisible();
});

test('a saved room never bypasses the start menu or connects before an explicit join', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('aqua-rush-online-seat', JSON.stringify({
      code: 'ABCDEFGH', name: 'Previous Captain', token: 'expired-test-seat',
    }));
  });
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) >= 5);
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.locator('#title-start-button')).toBeEnabled();
  await expect(page.locator('#online-panel')).toBeHidden();
  expect(sockets).toEqual([]);
  await page.locator('#title-start-button').click();
  await page.locator('#mode-online-button').click();
  await expect(page.locator('#online-name')).toHaveValue('Previous Captain');
  await expect(page.locator('#online-code')).toHaveValue('ABCDEFGH');
  expect(sockets).toEqual([]);
  await page.locator('#online-leave').click();
  await expect(page.locator('#title-screen')).toBeVisible();
});
