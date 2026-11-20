const { test, expect } = require('@playwright/test');
const {
  BATTLE_PREFIX,
  INVENTORY_KEY,
  POINTER_KEY,
  STATS_KEY,
  battle,
  pointer,
  seedStorage,
  stats
} = require('./support');

async function holdStatsLock(page) {
  await page.evaluate(() => {
    window.__releaseTestStatsLock = null;
    navigator.locks.request('muscules_neo_stats_write_v01', () => new Promise(resolve => {
      window.__releaseTestStatsLock = resolve;
    }));
  });
  await page.waitForFunction(() => typeof window.__releaseTestStatsLock === 'function');
}

async function raceClaims(page, secondPage) {
  await holdStatsLock(page);
  await Promise.all([
    page.evaluate(() => document.getElementById('claim').click()),
    secondPage.evaluate(() => document.getElementById('claim').click())
  ]);
  await page.evaluate(() => window.__releaseTestStatsLock());
}

async function openSharedVictory(page, secondPage, enemyId, encounterId) {
  const encounterPointer = pointer(enemyId, encounterId);
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats({ xp: 100 }),
      [INVENTORY_KEY]: [],
      [POINTER_KEY]: encounterPointer,
      [BATTLE_PREFIX + enemyId]: battle(enemyId, encounterId)
    }
  });
  const link = `/combate.html?encounter=${encodeURIComponent(encounterId)}`;
  await Promise.all([page.goto(link), secondPage.goto(link)]);
  await Promise.all([
    expect(page.locator('#win')).toBeVisible(),
    expect(secondPage.locator('#win')).toBeVisible()
  ]);
}

test('XP de un encuentro solo se acredita una vez ante reclamos concurrentes', async ({ page, context }) => {
  const secondPage = await context.newPage();
  const enemyId = 'carrotnero';
  const encounterId = 'concurrent-xp-claim';
  await openSharedVictory(page, secondPage, enemyId, encounterId);

  await raceClaims(page, secondPage);
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).xp, STATS_KEY))
    .toBe(130);
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).claimed, BATTLE_PREFIX + enemyId))
    .toBe(true);

  await page.reload();
  await expect(page.locator('#claim')).toBeDisabled();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).xp, STATS_KEY)).toBe(130);
});

test('la recompensa de ítem no se duplica ante reclamos concurrentes ni refresh', async ({ page, context }) => {
  const secondPage = await context.newPage();
  const enemyId = 'pescado';
  const encounterId = 'concurrent-item-claim';
  await openSharedVictory(page, secondPage, enemyId, encounterId);

  await raceClaims(page, secondPage);
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY))
    .toEqual(['cumbia']);
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).claimed, BATTLE_PREFIX + enemyId))
    .toBe(true);

  await page.reload();
  await expect(page.locator('#claim')).toBeDisabled();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY))
    .toEqual(['cumbia']);
});
