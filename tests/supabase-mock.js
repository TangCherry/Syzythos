(() => {
  const ROLE_KEY = 'muscules_playwright_mock_role';
  const SESSION_KEY = 'muscules_playwright_mock_session';
  const QUERY_KEY = 'muscules_playwright_mock_queries';
  const GAME_STATE_KEY = 'muscules_playwright_remote_game_state';
  const RECEIPTS_KEY = 'muscules_playwright_rpc_receipts';
  const STATS_KEY = 'muscules_neo_stats_v01';
  const INVENTORY_KEY = 'muscules_neo_inventory_v01';
  const POINTER_KEY = 'muscules_dynamic_current_encounter_v01';
  const BATTLE_PREFIX = 'muscules_dynamic_battle_v02_';
  const DEFAULT_HERO = {
    hp: 28,
    maxHp: 28,
    atk: 35,
    xp: 9750,
    weapon: 'Gancho',
    sign: 'Sagitario',
    levelName: 'Neogon'
  };
  const ENEMIES = {
    carrotnero: { id: 'carrotnero', name: 'Carrotñero', hp: 45, atk: 8, xp: 30, armor: 3, effect: null },
    buho: { id: 'buho', name: 'Búho musgo', hp: 45, atk: 4, xp: 10, armor: 0, effect: { type: 'owl_foresight', chance: 0.25, amount: 4 } },
    duendecillo: { id: 'duendecillo', name: 'Duendecillo roba XP', hp: 40, atk: 4, xp: 30, armor: 0, effect: { type: 'steal_xp', amount: 5 } },
    pescado: { id: 'pescado', name: 'Pescado a la hoja de ajo', hp: 35, atk: 12, xp: null, armor: 0, effect: { type: 'underwater_atk', amount: 5 }, reward: { type: 'item', description: 'Poción' } }
  };
  const ITEM_KINDS = {
    llave: 'escape', fuego: 'damage_bonus', totem: 'atk_battle', ojo: 'hp_bonus',
    sherma: 'atk_first', maaaake: 'atk_override', stirfry: 'heal', morision: 'instant_kill',
    galleta: 'heal_full', encendedor: 'damage', cumbia: 'heal_full', gusanito: 'atk_battle',
    gatito: 'revive', bola: 'roll_bonus', miau: 'revive_half', vida_extra: 'revive_full'
  };

  try {
    window.MUSCULES_SUPABASE_TEST_QUERIES = JSON.parse(sessionStorage.getItem(QUERY_KEY) || '[]');
  } catch {
    window.MUSCULES_SUPABASE_TEST_QUERIES = [];
  }

  const clone = value => JSON.parse(JSON.stringify(value));
  const readJson = (storage, key, fallback) => {
    try {
      const raw = storage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  let deferredReadSequence = 0;
  let nextDeferredGameStateRead = null;
  let nextRpcFailure = null;
  const deferredGameStateReads = new Map();

  function deferNextGameStateRead() {
    const id = `deferred-game-state-read-${++deferredReadSequence}`;
    let resolve;
    const promise = new Promise(complete => { resolve = complete; });
    const deferred = { id, started: false, promise, resolve };
    deferredGameStateReads.set(id, deferred);
    nextDeferredGameStateRead = deferred;
    return id;
  }

  function finishDeferredGameStateRead(id, result) {
    const deferred = deferredGameStateReads.get(id);
    if (!deferred?.started) return false;
    deferred.resolve(result);
    return true;
  }

  function roleForPage() {
    const requestedRole = new URLSearchParams(location.search).get('__mock_role');
    if (requestedRole === 'dm' || requestedRole === 'player') return requestedRole;
    return location.pathname.startsWith('/dm') ? 'dm' : 'player';
  }

  function makeSession(role) {
    return {
      access_token: 'playwright-mock-token',
      user: {
        id: `test-${crypto.randomUUID()}`,
        email: `test-${role}@example.invalid`
      }
    };
  }

  function readSession() {
    if (new URLSearchParams(location.search).has('__mock_no_session')) return null;
    if (location.pathname.endsWith('/login.html')) {
      try {
        const stored = sessionStorage.getItem(SESSION_KEY);
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    }
    const role = roleForPage();
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored && sessionStorage.getItem(ROLE_KEY) === role) return JSON.parse(stored);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    const session = makeSession(role);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(ROLE_KEY, role);
    return session;
  }

  function readGameData() {
    const storedRemote = localStorage.getItem(GAME_STATE_KEY);
    if (storedRemote !== null) {
      let remote;
      try {
        remote = JSON.parse(storedRemote);
      } catch {
        throw new Error('El estado remoto simulado tiene JSON inválido.');
      }
      if (!remote || remote.id !== 'neo_main' || !remote.data) {
        throw new Error('El estado remoto simulado no contiene neo_main válido.');
      }
      return remote.data;
    }
    const hero = { ...DEFAULT_HERO, ...readJson(localStorage, STATS_KEY, {}) };
    const inventory = readJson(localStorage, INVENTORY_KEY, []);
    const pointer = readJson(localStorage, POINTER_KEY, null);
    const battles = {};
    if (pointer?.enemyId && pointer.encounterId) {
      const battle = readJson(localStorage, BATTLE_PREFIX + pointer.enemyId, null);
      if (battle) {
        battles[pointer.encounterId] = {
          ...battle,
          encounterId: pointer.encounterId,
          enemyId: pointer.enemyId,
          enemySnapshot: ENEMIES[pointer.enemyId] || null
        };
      }
    }
    return {
      schemaVersion: 1,
      revision: 0,
      hero,
      inventory: Array.isArray(inventory) ? inventory : [],
      currentEncounter: pointer,
      battles
    };
  }

  function mirrorLegacyKeys(data) {
    localStorage.setItem(STATS_KEY, JSON.stringify(data.hero));
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(data.inventory));
    if (data.currentEncounter) {
      localStorage.setItem(POINTER_KEY, JSON.stringify(data.currentEncounter));
    } else {
      localStorage.removeItem(POINTER_KEY);
    }
    for (const battle of Object.values(data.battles)) {
      localStorage.setItem(BATTLE_PREFIX + battle.enemyId, JSON.stringify(battle));
    }
  }

  function writeGameData(data) {
    localStorage.setItem(GAME_STATE_KEY, JSON.stringify({
      id: 'neo_main',
      updated_at: new Date().toISOString(),
      data
    }));
    mirrorLegacyKeys(data);
  }

  function readReceipts() {
    return readJson(localStorage, RECEIPTS_KEY, {});
  }

  function roleError() {
    return { data: null, error: { code: '42501', message: 'El usuario no tiene el rol requerido.' } };
  }

  function staleError() {
    return { data: null, error: { code: '40001', message: 'El estado cambió en otro dispositivo.' } };
  }

  function createClient() {
    const auth = {
      async getSession() {
        return { data: { session: readSession() }, error: null };
      },
      async signInWithPassword({ email, password }) {
        if (!email || !password) return { data: {}, error: { message: 'Credenciales inválidas de prueba.' } };
        const role = roleForPage();
        const session = makeSession(role);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        sessionStorage.setItem(ROLE_KEY, role);
        return { data: { session, user: session.user }, error: null };
      },
      async signOut() {
        const params = new URLSearchParams(location.search);
        if (params.has('__mock_signout_fail_once')
          && !sessionStorage.getItem('muscules_playwright_signout_failed')) {
          sessionStorage.setItem('muscules_playwright_signout_failed', '1');
          return { error: { message: 'Error simulado al cerrar sesión.' } };
        }
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        sessionStorage.removeItem('muscules_playwright_signout_failed');
        return { error: null };
      }
    };

    return {
      auth,
      from(table) {
        let userId;
        let gameId;
        let selectedColumns;
        return {
          select(columns) {
            selectedColumns = columns;
            return this;
          },
          eq(column, value) {
            if (table === 'game_members' && column === 'user_id') userId = value;
            if (table === 'game_state' && column === 'id') gameId = value;
            return this;
          },
          async maybeSingle() {
            const session = readSession();
            window.MUSCULES_SUPABASE_TEST_QUERIES.push({
              table,
              selectedColumns,
              userId,
              sessionUserId: session?.user?.id
            });
            sessionStorage.setItem(QUERY_KEY, JSON.stringify(window.MUSCULES_SUPABASE_TEST_QUERIES));
            if (table !== 'game_members' || userId !== session?.user?.id) {
              return { data: null, error: null };
            }
            if (new URLSearchParams(location.search).has('__mock_role_lookup_fail')) {
              return { data: null, error: { message: 'Error simulado al consultar game_members.' } };
            }
            return { data: { role: sessionStorage.getItem(ROLE_KEY) || roleForPage() }, error: null };
          },
          async single() {
            if (table !== 'game_state' || gameId !== 'neo_main') {
              return { data: null, error: { message: 'No existe la partida remota solicitada.' } };
            }
            const data = readGameData();
            const response = {
              data: { id: 'neo_main', updated_at: readJson(localStorage, GAME_STATE_KEY, {}).updated_at || '2026-11-20T00:00:00.000Z', data: clone(data) },
              error: null
            };
            const deferred = nextDeferredGameStateRead;
            if (deferred) {
              nextDeferredGameStateRead = null;
              deferred.started = true;
              const result = await deferred.promise;
              deferredGameStateReads.delete(deferred.id);
              if (result.type === 'error') throw new Error(result.message);
            }
            return response;
          }
        };
      },
      async rpc(name, args) {
        const session = readSession();
        const role = sessionStorage.getItem(ROLE_KEY) || roleForPage();
        window.MUSCULES_SUPABASE_TEST_QUERIES.push({
          rpc: name,
          argumentNames: Object.keys(args || {}),
          sessionUserId: session?.user?.id
        });
        sessionStorage.setItem(QUERY_KEY, JSON.stringify(window.MUSCULES_SUPABASE_TEST_QUERIES));
        const dmOperations = ['dm_update_hero', 'dm_grant_item', 'dm_remove_item', 'dm_activate_encounter'];
        if (!session || (dmOperations.includes(name) ? role !== 'dm' : role !== 'player')) return roleError();
        if (nextRpcFailure?.name === name) {
          const failure = nextRpcFailure;
          nextRpcFailure = null;
          return {
            data: null,
            error: { code: failure.code, message: failure.message }
          };
        }

        const requestId = args.p_request_id;
        const receiptKey = `${session.user.id}:${name}:${requestId}`;
        const receipts = readReceipts();
        if (receipts[receiptKey]) {
          return { data: clone(receipts[receiptKey]), error: null };
        }

        const data = clone(readGameData());
        if (args.p_expected_revision !== data.revision) return staleError();
        const encounterId = args.p_encounter_id;
        const currentBattle = encounterId ? data.battles[encounterId] : null;
        let result;

        if (name === 'dm_update_hero') {
          const hero = data.hero;
          if (args.p_hp > args.p_max_hp || args.p_max_hp < 1
            || [args.p_hp, args.p_max_hp, args.p_atk, args.p_xp].some(value => !Number.isSafeInteger(value) || value < 0)) {
            return { data: null, error: { code: '22023', message: 'Las estadísticas solicitadas no son válidas.' } };
          }
          Object.assign(hero, { hp: args.p_hp, maxHp: args.p_max_hp, atk: args.p_atk, xp: args.p_xp });
          const battle = data.currentEncounter && data.battles[data.currentEncounter.encounterId];
          if (battle?.status === 'active') {
            battle.heroHp = hero.hp;
            if (hero.hp === 0) {
              battle.status = 'lost';
              battle.reason = 'hp';
            }
          }
          result = { updated: true };
        } else if (name === 'dm_activate_encounter') {
          const snapshot = ENEMIES[args.p_enemy_id];
          if (!snapshot) return { data: null, error: { code: '22023', message: 'Enemigo no válido.' } };
          if (data.currentEncounter) {
            const old = data.battles[data.currentEncounter.encounterId];
            if (old?.status === 'active') {
              old.status = 'lost';
              old.reason = 'replaced';
              old.message = 'Cherry reemplazó este encuentro.';
            }
          }
          const id = crypto.randomUUID();
          const startedAt = Date.now();
          const expiresAt = startedAt + 24 * 60 * 60 * 1000;
          data.currentEncounter = {
            enemyId: snapshot.id,
            encounterId: id,
            startedAt,
            expiresAt,
            dmMessage: args.p_dm_message || ''
          };
          data.battles[id] = {
            id: `battle-${id}`,
            encounterId: id,
            enemyId: snapshot.id,
            enemySnapshot: clone(snapshot),
            startedAt,
            expiresAt,
            enemyHp: snapshot.hp,
            heroHp: data.hero.hp,
            status: data.hero.hp > 0 ? 'active' : 'lost',
            reason: data.hero.hp > 0 ? null : 'hp',
            round: 0,
            claimed: false,
            itemUsed: false,
            message: `¡${snapshot.name} te desafía! Neo ataca primero.`
          };
          result = { activated: true, encounterId: id };
        } else if (name === 'dm_grant_item') {
          if (!ITEM_KINDS[args.p_item_id]) return { data: null, error: { code: '22023', message: 'Objeto no válido.' } };
          if (data.inventory.length >= 15) return { data: null, error: { code: '22023', message: 'El inventario ya tiene 15 objetos.' } };
          data.inventory.push(args.p_item_id);
          result = { granted: args.p_item_id };
        } else if (name === 'dm_remove_item') {
          const slot = args.p_slot;
          if (!Number.isSafeInteger(slot) || slot < 0 || slot >= data.inventory.length) {
            return { data: null, error: { code: '22023', message: 'La posición del objeto no existe.' } };
          }
          const [removed] = data.inventory.splice(slot, 1);
          result = { removed, slot };
        } else if (name === 'player_combat_turn') {
          if (!currentBattle || currentBattle.status !== 'active') {
            return { data: null, error: { code: '22023', message: 'La batalla no está activa.' } };
          }
          if (currentBattle.expiresAt <= Date.now()) {
            currentBattle.status = 'lost';
            currentBattle.reason = 'time';
            currentBattle.message = 'Se acabaron las 24 horas; el enemigo escapó.';
            result = { expired: true, status: 'lost' };
          } else {
            currentBattle.round++;
            currentBattle.enemyHp = Math.max(0, currentBattle.enemyHp - 1);
            currentBattle.heroHp = Math.max(0, data.hero.hp - 1);
            data.hero.hp = currentBattle.heroHp;
            currentBattle.status = currentBattle.heroHp === 0 ? 'lost' : currentBattle.enemyHp === 0 ? 'won' : 'active';
            if (currentBattle.status === 'lost') currentBattle.reason = 'hp';
            currentBattle.message = `Ronda ${currentBattle.round}: acción procesada por el servidor de prueba.`;
            result = { round: currentBattle.round, status: currentBattle.status, neoDamage: 1, enemyDamage: 1 };
          }
        } else if (name === 'player_use_item') {
          const slot = args.p_slot;
          const itemId = data.inventory[slot];
          const kind = ITEM_KINDS[itemId];
          if (!currentBattle || !kind) return { data: null, error: { code: '22023', message: 'El objeto no se puede utilizar.' } };
          if (['revive', 'revive_half', 'revive_full'].includes(kind)) {
            if (currentBattle.status !== 'lost' || currentBattle.reason !== 'hp' || data.hero.hp !== 0) {
              return { data: null, error: { code: '22023', message: 'Este objeto no puede revivir a Neo en este estado.' } };
            }
            data.hero.hp = kind === 'revive_full' ? data.hero.maxHp
              : kind === 'revive_half' ? Math.floor(data.hero.maxHp / 2) : 10;
            data.inventory.splice(slot, 1);
            result = { revived: true, itemId, hp: data.hero.hp, encounterId };
          } else {
            if (currentBattle.status !== 'active' || currentBattle.itemUsed) {
              return { data: null, error: { code: '22023', message: 'Este objeto no se puede utilizar ahora.' } };
            }
            if (kind === 'heal_full' || kind === 'heal') {
              data.hero.hp = Math.min(data.hero.maxHp, data.hero.hp + (kind === 'heal_full' ? data.hero.maxHp : 15));
            } else if (kind === 'damage' || kind === 'instant_kill') {
              currentBattle.enemyHp = Math.max(0, currentBattle.enemyHp - (kind === 'instant_kill' ? currentBattle.enemyHp : 3));
            }
            currentBattle.itemUsed = true;
            currentBattle.heroHp = data.hero.hp;
            data.inventory.splice(slot, 1);
            if (currentBattle.enemyHp === 0) currentBattle.status = 'won';
            result = { used: itemId, enemyHp: currentBattle.enemyHp, heroHp: data.hero.hp, status: currentBattle.status };
          }
        } else if (name === 'player_claim_reward') {
          if (!currentBattle) return { data: null, error: { code: '22023', message: 'No se encontró la batalla.' } };
          if (currentBattle.claimed) {
            data.revision += 0;
            result = { claimed: true, alreadyClaimed: true };
            const response = { revision: data.revision, data: clone(data), result };
            receipts[receiptKey] = response;
            localStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
            return { data: response, error: null };
          }
          if (currentBattle.status !== 'won') return { data: null, error: { code: '22023', message: 'La batalla aún no tiene recompensa.' } };
          const reward = currentBattle.enemySnapshot.reward;
          if (reward?.type === 'item') {
            if (data.inventory.length >= 15) return { data: null, error: { code: '22023', message: 'Inventario lleno.' } };
            data.inventory.push('cumbia');
            currentBattle.rewardMessage = 'Obtuviste: Poción de la cumbia';
          } else {
            const xp = currentBattle.enemySnapshot.xp || 0;
            data.hero.xp += xp;
            currentBattle.rewardMessage = `XP total: ${data.hero.xp}`;
          }
          currentBattle.claimed = true;
          result = { claimed: true, rewardType: reward?.type || 'xp' };
        } else {
          return { data: null, error: { code: '42883', message: 'RPC no disponible en el mock.' } };
        }

        data.revision++;
        const response = { revision: data.revision, data: clone(data), result };
        writeGameData(data);
        receipts[receiptKey] = response;
        localStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
        return { data: response, error: null };
      }
    };
  }

  window.MUSCULES_SUPABASE_TEST_ADAPTER = Object.freeze({
    createClient,
    getGameData: () => clone(readGameData()),
    setGameData: data => writeGameData(clone(data)),
    failNextRpc: (name, code, message) => { nextRpcFailure = { name, code, message }; },
    deferNextGameStateRead,
    isDeferredGameStateReadStarted: id => deferredGameStateReads.get(id)?.started || false,
    resolveDeferredGameStateRead: id => finishDeferredGameStateRead(id, { type: 'success' }),
    rejectDeferredGameStateRead: (id, message) =>
      finishDeferredGameStateRead(id, { type: 'error', message })
  });
})();
