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

async function openActiveCombat(page, encounterId, { inventory = [], hp = 9, maxHp = 18 } = {}) {
  const enemyId = 'carrotnero';
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats({ hp, maxHp }),
      [INVENTORY_KEY]: inventory,
      [POINTER_KEY]: pointer(enemyId, encounterId),
      [BATTLE_PREFIX + enemyId]: battle(enemyId, encounterId, {
        enemyHp: 45,
        heroHp: hp,
        status: 'active',
        reason: null,
        round: 0
      })
    }
  });
  await page.goto(`/combate.html?encounter=${encodeURIComponent(encounterId)}`);
  await expect(page.locator('#battle')).toBeVisible();
  await expect(page.locator('#roll')).toBeEnabled();
  return enemyId;
}

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

test('una lectura anterior a un turno no revierte la respuesta RPC más reciente', async ({ page }) => {
  const encounterId = 'stale-read-after-turn';
  await openActiveCombat(page, encounterId);
  const readId = await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.deferNextGameStateRead()
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(id =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.isDeferredGameStateReadStarted(id), readId
  )).toBe(true);

  await page.locator('#roll').click();
  await expect(page.locator('#battle [data-hero-hp-value]')).toHaveText('8/18 HP');
  await expect.poll(() => page.evaluate(() => {
    const data = window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData();
    return { revision: data.revision, round: data.battles['stale-read-after-turn'].round };
  })).toEqual({ revision: 1, round: 1 });

  await page.evaluate(id =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.resolveDeferredGameStateRead(id), readId
  );
  await expect(page.locator('#battle')).toBeVisible();
  await expect(page.locator('#battle [data-hero-hp-value]')).toHaveText('8/18 HP');
  await expect(page.locator('#log')).toContainText('Ronda 1: acción procesada');
  await expect.poll(() => page.evaluate(() => {
    const data = window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData();
    return { revision: data.revision, round: data.battles['stale-read-after-turn'].round };
  })).toEqual({ revision: 1, round: 1 });
});

test('un error de lectura retrasada no borra el estado tras una acción exitosa', async ({ page }) => {
  const encounterId = 'stale-read-error-after-turn';
  await openActiveCombat(page, encounterId);
  const readId = await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.deferNextGameStateRead()
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(id =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.isDeferredGameStateReadStarted(id), readId
  )).toBe(true);

  await page.locator('#roll').click();
  await expect(page.locator('#battle [data-hero-hp-value]')).toHaveText('8/18 HP');
  await expect.poll(() => page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData().revision
  )).toBe(1);

  await page.evaluate(id =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.rejectDeferredGameStateRead(id, 'Fallo de lectura retrasada'),
    readId
  );
  await expect(page.locator('#battle')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden();
  await expect(page.locator('#battle [data-hero-hp-value]')).toHaveText('8/18 HP');
  await expect(page.locator('#log')).toContainText('Ronda 1: acción procesada');
});

test('un fallo de refresh cierra y limpia el inventario sin dejar acciones sobre estado nulo', async ({ page }) => {
  const encounterId = 'inventory-read-failure';
  await openActiveCombat(page, encounterId, { inventory: ['bola'] });
  await page.locator('#inventory-toggle').click();
  await expect(page.locator('#inventory-grid button:not(:disabled)')).toHaveCount(1);
  await page.evaluate(() => {
    window.__staleInventorySlot = document.querySelector('#inventory-grid button:not(:disabled)');
  });

  const readId = await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.deferNextGameStateRead()
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(id =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.isDeferredGameStateReadStarted(id), readId
  )).toBe(true);
  await page.evaluate(id =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.rejectDeferredGameStateRead(id, 'Lectura remota fallida'),
    readId
  );

  await expect(page.locator('#waiting')).toBeVisible();
  await expect(page.locator('#inventory-overlay')).toBeHidden();
  await expect(page.locator('#inventory-grid button')).toHaveCount(0);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.evaluate(() => window.__staleInventorySlot.click());
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.filter(query => query.rpc === 'player_use_item').length
  )).toBe(0);
});

test('un error de RPC permanece visible tras un refresh y se limpia al iniciar otra acción', async ({ page }) => {
  const encounterId = 'persistent-action-error';
  await openActiveCombat(page, encounterId);
  await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.failNextRpc(
      'player_combat_turn',
      'XX000',
      'Fallo de RPC simulado'
    )
  );
  await page.locator('#roll').click();
  await expect(page.locator('#log')).toContainText('Fallo de RPC simulado');

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#log')).toContainText('Fallo de RPC simulado');
  await page.locator('#roll').click();
  await expect.poll(() => page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData().revision
  )).toBe(1);
  await expect(page.locator('#log')).toContainText('Ronda 1: acción procesada por el servidor de prueba.');
});

test('la expiración automática se procesa para un segundo encuentro en la misma página', async ({ page }) => {
  const firstEncounterId = 'expiry-first-encounter';
  const expiredAt = Date.now() - 1000;
  const currentPointer = {
    ...pointer('carrotnero', firstEncounterId),
    startedAt: expiredAt - 1000,
    expiresAt: expiredAt
  };
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats(),
      [INVENTORY_KEY]: [],
      [POINTER_KEY]: currentPointer,
      [BATTLE_PREFIX + 'carrotnero']: battle('carrotnero', firstEncounterId, {
        enemyHp: 45,
        heroHp: 28,
        status: 'active',
        reason: null,
        round: 0,
        startedAt: currentPointer.startedAt,
        expiresAt: expiredAt
      })
    }
  });
  await page.goto('/combate.html');
  await expect.poll(() => page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.filter(query => query.rpc === 'player_combat_turn').length
  )).toBe(1);
  await expect.poll(() =>
    page.evaluate(id =>
      window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData().battles[id].status,
      firstEncounterId
    )
  ).toBe('lost');

  const secondEncounterId = 'expiry-second-encounter';
  await page.evaluate(({ encounterId }) => {
    const adapter = window.MUSCULES_SUPABASE_TEST_ADAPTER;
    const data = adapter.getGameData();
    const expiredAt = Date.now() - 1000;
    const startedAt = expiredAt - 1000;
    const previousBattle = data.battles['expiry-first-encounter'];
    data.revision++;
    data.currentEncounter = {
      enemyId: 'carrotnero',
      encounterId,
      startedAt,
      expiresAt: expiredAt,
      dmMessage: ''
    };
    data.battles[encounterId] = {
      ...previousBattle,
      id: `battle-${encounterId}`,
      encounterId,
      startedAt,
      expiresAt: expiredAt,
      enemyHp: 45,
      heroHp: data.hero.hp,
      status: 'active',
      reason: null,
      round: 0,
      claimed: false,
      itemUsed: false,
      message: 'Segundo encuentro de prueba.'
    };
    adapter.setGameData(data);
    window.dispatchEvent(new Event('focus'));
  }, { encounterId: secondEncounterId });

  await expect.poll(() => page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.filter(query => query.rpc === 'player_combat_turn').length
  )).toBe(2);
  await expect.poll(() =>
    page.evaluate(id =>
      window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData().battles[id].status,
      secondEncounterId
    )
  ).toBe('lost');
});

test('un cambio remoto de revisión invalida la selección del objeto y permite volver a elegir', async ({ page }) => {
  const encounterId = 'inventory-revision-change';
  await openActiveCombat(page, encounterId, { inventory: ['bola', 'fuego'] });
  await page.locator('#inventory-toggle').click();
  await page.getByRole('button', { name: 'Bola de cristal' }).click();
  await expect(page.locator('#inventory-card img')).toHaveAttribute('alt', 'Tarjeta: Bola de cristal');

  await page.evaluate(() => {
    const adapter = window.MUSCULES_SUPABASE_TEST_ADAPTER;
    const data = adapter.getGameData();
    data.revision++;
    data.inventory = ['fuego', 'bola'];
    adapter.setGameData(data);
    window.dispatchEvent(new Event('focus'));
  });

  await expect(page.locator('#inventory-hint'))
    .toContainText('El estado cambió en otro dispositivo');
  await expect(page.locator('#inventory-hint'))
    .toContainText('selecciona nuevamente el objeto');
  await expect(page.locator('#inventory-apply')).toBeDisabled();
  await expect.poll(() => page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData().inventory
  )).toEqual(['fuego', 'bola']);
  expect(await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.filter(query => query.rpc === 'player_use_item').length
  )).toBe(0);

  await page.locator('#inventory-detail-close').click();
  await page.getByRole('button', { name: 'Fuego en la espada' }).click();
  await expect(page.locator('#inventory-card img')).toHaveAttribute('alt', 'Tarjeta: Fuego en la espada');
  await page.locator('#inventory-apply').click();
  await expect.poll(() => page.evaluate(() => {
    const data = window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData();
    return { revision: data.revision, inventory: data.inventory };
  })).toEqual({ revision: 2, inventory: ['bola'] });
});

test('un conflicto de revisión no consume el objeto del espacio actualizado remotamente', async ({ page }) => {
  const encounterId = 'inventory-revision-conflict';
  await openActiveCombat(page, encounterId, { inventory: ['bola', 'fuego'] });
  await page.locator('#inventory-toggle').click();
  await page.getByRole('button', { name: 'Bola de cristal' }).click();

  await page.evaluate(() => {
    const adapter = window.MUSCULES_SUPABASE_TEST_ADAPTER;
    const data = adapter.getGameData();
    data.revision++;
    data.inventory = ['fuego', 'bola'];
    adapter.setGameData(data);
  });
  await page.locator('#inventory-apply').click();

  await expect(page.locator('#inventory-hint'))
    .toContainText('La partida cambió en otro dispositivo');
  await expect(page.locator('#inventory-hint'))
    .toContainText('selecciona nuevamente el objeto');
  await expect.poll(() => page.evaluate(() => {
    const data = window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData();
    return { revision: data.revision, inventory: data.inventory };
  })).toEqual({ revision: 1, inventory: ['fuego', 'bola'] });
  expect(await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.filter(query => query.rpc === 'player_use_item').length
  )).toBe(1);
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
