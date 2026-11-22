const { test, expect } = require('@playwright/test');
const {
  INVENTORY_KEY,
  POINTER_KEY,
  STATS_KEY,
  battle,
  pointer,
  seedStorage,
  stats
} = require('./support');

test('el combate envía la acción a la RPC y muestra el estado persistido', async ({ page }) => {
  const enemyId = 'carrotnero';
  const encounterId = 'remote-turn';
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats({ hp: 9, maxHp: 18 }),
      [INVENTORY_KEY]: [],
      [POINTER_KEY]: pointer(enemyId, encounterId),
      ['muscules_dynamic_battle_v02_' + enemyId]: battle(enemyId, encounterId, {
        enemyHp: 45,
        heroHp: 9,
        status: 'active',
        round: 0
      })
    }
  });
  await page.goto(`/combate.html?encounter=${encodeURIComponent(encounterId)}`);
  await expect(page.locator('#battle')).toBeVisible();
  await expect(page.locator('#battle [data-hero-hp-track]')).toBeVisible();
  await expect(page.locator('#battle [data-hero-hp-value]')).toHaveText('9/18 HP');
  await page.locator('#roll').click();

  await expect.poll(async () => page.evaluate(() => {
    const data = window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData();
    return {
      revision: data.revision,
      round: data.battles['remote-turn'].round,
      hp: data.hero.hp
    };
  })).toEqual({ revision: 1, round: 1, hp: 8 });
  await expect(page.locator('#battle [data-hero-hp-value]')).toHaveText('8/18 HP');
  await expect(page.locator('#battle [data-hero-hp-track]')).toHaveAttribute('aria-valuenow', '8');
  await expect(page.locator('#battle [data-counterattack-message]')).toContainText('Neo recibió 1 HP de daño');
  await expect(page.locator('#log')).toContainText('Ronda 1: acción procesada por el servidor de prueba.');
  expect(await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.find(query => query.rpc === 'player_combat_turn')
  )).toMatchObject({
    rpc: 'player_combat_turn',
    argumentNames: ['p_encounter_id', 'p_expected_revision', 'p_request_id']
  });
});

test('muestra el HP autoritativo de Neo después de una victoria', async ({ page }) => {
  const enemyId = 'carrotnero';
  const encounterId = 'remote-win-hp';
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats(),
      [INVENTORY_KEY]: [],
      [POINTER_KEY]: pointer(enemyId, encounterId),
      ['muscules_dynamic_battle_v02_' + enemyId]: battle(enemyId, encounterId, {
        enemyHp: 1,
        heroHp: 28,
        status: 'active',
        round: 0
      })
    }
  });
  await page.goto(`/combate.html?encounter=${encodeURIComponent(encounterId)}`);
  await page.locator('#roll').click();

  await expect(page.locator('#win')).toBeVisible();
  await expect(page.locator('#win [data-hero-hp-value]')).toHaveText('27/28 HP');
  await expect(page.locator('#win [data-hero-hp-track]')).toHaveAttribute('aria-valuenow', '27');
});

test('muestra el HP de Neo y el contraataque al terminar en derrota', async ({ page }) => {
  const enemyId = 'carrotnero';
  const encounterId = 'remote-loss-hp';
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats({ hp: 1, maxHp: 18 }),
      [INVENTORY_KEY]: [],
      [POINTER_KEY]: pointer(enemyId, encounterId),
      ['muscules_dynamic_battle_v02_' + enemyId]: battle(enemyId, encounterId, {
        enemyHp: 45,
        heroHp: 1,
        status: 'active',
        round: 0
      })
    }
  });
  await page.goto(`/combate.html?encounter=${encodeURIComponent(encounterId)}`);
  await page.locator('#roll').click();

  await expect(page.locator('#lose')).toBeVisible();
  await expect(page.locator('#lose [data-hero-hp-value]')).toHaveText('0/18 HP');
  await expect(page.locator('#lose [data-hero-hp-track]')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('#lose [data-counterattack-message]')).toContainText('Neo recibió 1 HP de daño');
  await page.setViewportSize({ width: 375, height: 667 });
  const mobileLayout = await page.evaluate(() => {
    const health = document.querySelector('#lose .hero-health--result').getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      healthLeft: health.left,
      healthRight: health.right
    };
  });
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.healthLeft).toBeGreaterThanOrEqual(0);
  expect(mobileLayout.healthRight).toBeLessThanOrEqual(mobileLayout.viewportWidth);
});

test('un objeto revive después de perder, consume el objeto y no revierte la derrota', async ({ page }) => {
  const enemyId = 'carrotnero';
  const encounterId = 'remote-revive';
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats({ hp: 0 }),
      [INVENTORY_KEY]: ['gatito'],
      [POINTER_KEY]: pointer(enemyId, encounterId),
      ['muscules_dynamic_battle_v02_' + enemyId]: battle(enemyId, encounterId, {
        enemyHp: 30,
        heroHp: 0,
        status: 'lost',
        reason: 'hp',
        round: 2
      })
    }
  });
  await page.goto(`/combate.html?encounter=${encodeURIComponent(encounterId)}`);
  await expect(page.locator('#lose')).toBeVisible();
  await expect(page.locator('#claim')).toBeDisabled();
  await page.locator('#revive-button').click();
  await page.getByRole('button', { name: 'Gatito fantasma' }).click();
  await page.locator('#inventory-apply').click();

  await expect.poll(async () => page.evaluate(() => {
    const data = window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData();
    return {
      hp: data.hero.hp,
      inventory: data.inventory,
      status: data.battles['remote-revive'].status,
      claimed: data.battles['remote-revive'].claimed
    };
  })).toEqual({ hp: 10, inventory: [], status: 'lost', claimed: false });
  await expect(page.locator('#lose-detail')).toContainText('La derrota es permanente');
  await expect(page.locator('#claim')).toBeDisabled();
});
