const { test, expect } = require('@playwright/test');
const {
  BATTLE_PREFIX,
  INVENTORY_KEY,
  POINTER_KEY,
  battle,
  seedStorage
} = require('./support');

async function activate(page, enemyId) {
  const previousLink = await page.locator('#dm-encounter-url').inputValue();
  await page.locator('#dm-enemy').selectOption(enemyId);
  await page.locator('#dm-encounter-save').click();
  await expect.poll(() => page.locator('#dm-encounter-url').inputValue())
    .not.toBe(previousLink);
  return page.locator('#dm-encounter-url').inputValue();
}

test('un enlace vigente abre el combate y un enlace reemplazado queda bloqueado', async ({ page }) => {
  await page.goto('/dm-encuentro.html');
  const oldLink = await activate(page, 'carrotnero');
  const newLink = await activate(page, 'buho');
  expect(newLink).not.toBe(oldLink);

  const oldUrl = new URL(oldLink);
  await page.goto(oldUrl.pathname + oldUrl.search);
  await expect(page.locator('#waiting')).toBeVisible();
  await expect(page.locator('#waiting-message')).toContainText('ya no corresponde');
});

test('un encuentro vencido produce derrota sin esperar 24 horas', async ({ page }) => {
  await page.goto('/dm-encuentro.html');
  const link = await activate(page, 'carrotnero');
  await page.evaluate(() => {
    const adapter = window.MUSCULES_SUPABASE_TEST_ADAPTER;
    const data = adapter.getGameData();
    const encounter = data.currentEncounter;
    encounter.expiresAt = Date.now() - 1000;
    data.battles[encounter.encounterId].expiresAt = encounter.expiresAt;
    adapter.setGameData(data);
  });

  const url = new URL(link);
  await page.goto(url.pathname + url.search);
  await expect(page.locator('#lose')).toBeVisible();
  await expect(page.locator('#lose-reason')).toHaveText('Tiempo agotado');
});

test('un encuentro reemplazado conserva su recompensa pendiente y permite reclamarla', async ({ page }) => {
  const enemyId = 'pescado';
  const encounterId = 'pending-reward-replacement';
  const currentPointer = {
    enemyId,
    encounterId,
    startedAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    dmMessage: ''
  };
  await seedStorage(page, {
    local: {
      [POINTER_KEY]: currentPointer,
      [BATTLE_PREFIX + enemyId]: battle(enemyId, encounterId),
      [INVENTORY_KEY]: []
    }
  });
  await page.goto('/dm-encuentro.html');
  await activate(page, 'buho');

  const storedBattle = await page.evaluate(() => {
    const data = window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData();
    return data.battles['pending-reward-replacement'];
  });
  expect(storedBattle.claimed).toBe(false);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY)).toEqual([]);

  await page.goto(`/combate.html?encounter=${encodeURIComponent(encounterId)}`);
  await expect(page.locator('#win')).toBeVisible();
  await page.locator('#claim').click();
  await expect(page.locator('#claim')).toBeDisabled();
  expect(await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData().inventory
  )).toEqual(['cumbia']);
});
