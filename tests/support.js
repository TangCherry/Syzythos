const STATS_KEY = 'muscules_neo_stats_v01';
const INVENTORY_KEY = 'muscules_neo_inventory_v01';
const REMOTE_STATE_KEY = 'muscules_playwright_remote_game_state';
const NOTIFICATIONS_KEY = 'muscules_neo_gift_notifications_v01';
const POINTER_KEY = 'muscules_dynamic_current_encounter_v01';
const BATTLE_PREFIX = 'muscules_dynamic_battle_v02_';
const DEFAULT_STATS = {
  hp: 28,
  maxHp: 28,
  atk: 35,
  xp: 9750,
  weapon: 'Gancho',
  sign: 'Sagitario',
  levelName: 'Neogon'
};

function stats(overrides = {}) {
  return { ...DEFAULT_STATS, ...overrides };
}

function pointer(enemyId, encounterId) {
  const startedAt = Date.now();
  return {
    enemyId,
    encounterId,
    startedAt,
    expiresAt: startedAt + 24 * 60 * 60 * 1000,
    dmMessage: ''
  };
}

function battle(enemyId, encounterId, overrides = {}) {
  const currentPointer = pointer(enemyId, encounterId);
  return {
    id: `demo-${enemyId}`,
    encounterId,
    enemyId,
    startedAt: currentPointer.startedAt,
    expiresAt: currentPointer.expiresAt,
    enemyHp: 0,
    heroHp: 28,
    status: 'won',
    reason: null,
    round: 1,
    claimed: false,
    openingApplied: true,
    xpStolen: 0,
    rooted: false,
    slothAttacks: 0,
    owlPenalty: false,
    itemUsed: false,
    itemBuff: null,
    lapidaMaxHp: null,
    lapidaHp: null,
    poisonTurns: 0,
    message: 'Victoria de prueba',
    ...overrides
  };
}

async function seedStorage(page, { local = {}, session = {} } = {}) {
  await page.goto('/');
  await page.evaluate(({ localEntries, sessionEntries }) => {
    const writeEntries = (storage, entries) => {
      for (const [key, value] of Object.entries(entries)) {
        storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    };
    writeEntries(localStorage, localEntries);
    writeEntries(sessionStorage, sessionEntries);
  }, { localEntries: local, sessionEntries: session });
}

async function selectQaEnemy(page, enemyId) {
  await page.locator('#enemy-select').selectOption(enemyId);
  await page.waitForFunction(id => window.MusculesDemo?.state().battle?.enemyId === id, enemyId);
}

module.exports = {
  BATTLE_PREFIX,
  DEFAULT_STATS,
  INVENTORY_KEY,
  NOTIFICATIONS_KEY,
  POINTER_KEY,
  REMOTE_STATE_KEY,
  STATS_KEY,
  battle,
  pointer,
  selectQaEnemy,
  seedStorage,
  stats
};
