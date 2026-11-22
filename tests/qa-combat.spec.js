const { test, expect } = require('@playwright/test');
const {
  INVENTORY_KEY,
  STATS_KEY,
  selectQaEnemy,
  seedStorage,
  stats
} = require('./support');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.999999;
  });
});

test('QA escribe solo en sessionStorage, no en el estado local de producción', async ({ page }) => {
  const productionStats = stats({ hp: 18, xp: 12345 });
  const productionInventory = ['llave'];
  await seedStorage(page, {
    local: {
      [STATS_KEY]: productionStats,
      [INVENTORY_KEY]: productionInventory
    }
  });

  await page.goto('/combate-qa.html');
  await expect(page.locator('body')).toHaveAttribute('data-muscules-storage', 'qa');
  await selectQaEnemy(page, 'carrotnero');
  await page.evaluate(() => window.MusculesDemo.grantItem('cumbia'));

  const result = await page.evaluate(({ statsKey, inventoryKey }) => ({
    localStats: localStorage.getItem(statsKey),
    localInventory: localStorage.getItem(inventoryKey),
    sessionStats: sessionStorage.getItem(statsKey),
    sessionInventory: sessionStorage.getItem(inventoryKey),
    storageType: window.MusculesNeoStats.storageType
  }), { statsKey: STATS_KEY, inventoryKey: INVENTORY_KEY });

  expect(result.storageType).toBe('sessionStorage');
  expect(result.localStats).toBe(JSON.stringify(productionStats));
  expect(result.localInventory).toBe(JSON.stringify(productionInventory));
  expect(JSON.parse(result.sessionInventory)).toEqual(['cumbia']);
});

test('un ataque y el progreso de combate persisten al recargar QA', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/combate-qa.html');
  await selectQaEnemy(page, 'carrotnero');

  await page.locator('#roll').click();
  await expect.poll(async () => page.evaluate(() => window.MusculesDemo.state().battle.round))
    .toBe(1);
  const beforeReload = await page.evaluate(() => window.MusculesDemo.state().battle);

  await page.reload();
  const afterReload = await page.evaluate(() => window.MusculesDemo.state().battle);
  expect(afterReload.round).toBe(beforeReload.round);
  expect(afterReload.enemyHp).toBe(beforeReload.enemyHp);
  expect(afterReload.heroHp).toBe(beforeReload.heroHp);
});

test('la recompensa XP se reclama una sola vez y sobrevive al refresh en QA', async ({ page }) => {
  await seedStorage(page);
  await page.goto('/combate-qa.html');
  await selectQaEnemy(page, 'duendecillo');
  await page.evaluate(() => window.MusculesDemo.win());
  await expect(page.locator('#win')).toBeVisible();

  const xpBeforeClaim = await page.evaluate(() => window.MusculesNeoStats.read().xp);
  await page.locator('#claim').click();
  await expect(page.locator('#claim')).toBeDisabled();
  const xpAfterClaim = await page.evaluate(() => window.MusculesNeoStats.read().xp);
  expect(xpAfterClaim).toBe(xpBeforeClaim + 30);

  await page.reload();
  await expect(page.locator('#claim')).toBeDisabled();
  expect(await page.evaluate(() => window.MusculesNeoStats.read().xp)).toBe(xpAfterClaim);
});

test('un turno bloqueado puede terminar en derrota sin esperar', async ({ page }) => {
  await seedStorage(page, {
    session: {
      [STATS_KEY]: stats({ hp: 1 })
    }
  });
  await page.goto('/combate-qa.html');
  await selectQaEnemy(page, 'triangulon');

  await page.locator('#roll').click();
  await expect(page.locator('#lose')).toBeVisible();
  expect(await page.evaluate(() => window.MusculesDemo.state().battle.status)).toBe('lost');
  expect(await page.evaluate(() => window.MusculesNeoStats.read().hp)).toBe(0);
});

test('usar un objeto consume una unidad y persiste el HP en QA', async ({ page }) => {
  await seedStorage(page, {
    session: {
      [STATS_KEY]: stats({ hp: 20 }),
      [INVENTORY_KEY]: ['cumbia']
    }
  });
  await page.goto('/combate-qa.html');
  await selectQaEnemy(page, 'carrotnero');

  await page.locator('#inventory-toggle').click();
  await page.getByRole('button', { name: 'Poción de la cumbia', exact: true }).click();
  await page.locator('#inventory-apply').click();

  await expect.poll(() => page.evaluate(() => window.MusculesNeoStats.read().hp)).toBe(28);
  await expect.poll(() => page.evaluate(() => window.MusculesDemo.inventory())).toEqual([]);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.MusculesNeoStats.read().hp)).toBe(28);
  await expect.poll(() => page.evaluate(() => window.MusculesDemo.inventory())).toEqual([]);
});
