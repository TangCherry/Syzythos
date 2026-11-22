const SUPABASE_SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm';
let clientPromise;
const gameStateChannel = typeof BroadcastChannel === 'function'
  ? new BroadcastChannel('muscules:game_state:neo_main')
  : null;

export function subscribeToGameState(onChange) {
  if (!gameStateChannel || typeof onChange !== 'function') return () => {};
  const listener = event => {
    if (event.data?.gameId === 'neo_main') void onChange();
  };
  gameStateChannel.addEventListener('message', listener);
  return () => gameStateChannel.removeEventListener('message', listener);
}

export async function getSupabaseClient() {
  const testAdapter = window.MUSCULES_SUPABASE_TEST_ADAPTER;
  if (testAdapter && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    return testAdapter.createClient();
  }

  const config = window.MUSCULES_SUPABASE_CONFIG;
  if (!config || typeof config.url !== 'string' || typeof config.publishableKey !== 'string'
    || !config.url || !config.publishableKey) {
    throw new Error('Falta la configuración pública de Supabase. Revisa SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY.');
  }

  clientPromise ??= import(SUPABASE_SDK_URL).then(({ createClient }) => createClient(
    config.url,
    config.publishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    }
  ));
  return clientPromise;
}

export async function getCurrentSession() {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(`No se pudo obtener la sesión: ${error.message}`);
  return data.session;
}

export async function getUserRole(userId) {
  if (typeof userId !== 'string' || !userId) {
    throw new Error('La sesión no contiene un identificador de usuario válido.');
  }

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('game_members')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo consultar el rol del usuario: ${error.message}`);
  if (!data || !['dm', 'player'].includes(data.role)) {
    throw new Error('El usuario autenticado no tiene un rol válido en esta partida.');
  }
  return data.role;
}

export async function readRemoteGameState() {
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('game_state')
    .select('id, data, updated_at')
    .eq('id', 'neo_main')
    .single();
  if (error) throw new Error(`No se pudo leer el estado remoto de neo_main: ${error.message}`);
  if (data?.id !== 'neo_main') throw new Error('Supabase devolvió una partida distinta de neo_main.');
  validateGameData(data?.data);
  return data;
}

export function validateGameData(gameData) {
  if (!gameData || typeof gameData !== 'object' || Array.isArray(gameData)
    || !Number.isSafeInteger(gameData.revision) || gameData.revision < 0
    || gameData.schemaVersion !== 1) {
    throw new Error('El estado remoto de neo_main tiene una versión o revisión inválida.');
  }
  const hero = gameData.hero;
  if (!hero || typeof hero !== 'object' || Array.isArray(hero)
    || !Number.isSafeInteger(hero.hp) || !Number.isSafeInteger(hero.maxHp)
    || !Number.isSafeInteger(hero.atk) || !Number.isSafeInteger(hero.xp)
    || hero.hp < 0 || hero.maxHp < 1 || hero.hp > hero.maxHp
    || hero.atk < 0 || hero.xp < 0) {
    throw new Error('Las estadísticas remotas de Neo no tienen un formato válido.');
  }
  if (!Array.isArray(gameData.inventory) || gameData.inventory.length > 15
    || gameData.inventory.some(item => typeof item !== 'string')) {
    throw new Error('El inventario remoto de Neo no tiene un formato válido.');
  }
  if (!gameData.battles || typeof gameData.battles !== 'object' || Array.isArray(gameData.battles)) {
    throw new Error('El historial remoto de batallas no tiene un formato válido.');
  }
  if (gameData.currentEncounter !== null
    && (!gameData.currentEncounter || typeof gameData.currentEncounter !== 'object'
      || typeof gameData.currentEncounter.encounterId !== 'string'
      || typeof gameData.currentEncounter.enemyId !== 'string')) {
    throw new Error('El encuentro remoto actual no tiene un formato válido.');
  }
  return gameData;
}

export async function callGameRpc(name, args) {
  const allowed = new Set([
    'dm_update_hero',
    'dm_grant_item',
    'dm_remove_item',
    'dm_activate_encounter',
    'player_combat_turn',
    'player_use_item',
    'player_claim_reward'
  ]);
  if (!allowed.has(name)) throw new Error('La operación solicitada no está disponible.');

  const client = await getSupabaseClient();
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === '40001') {
      const conflict = new Error('La partida cambió en otro dispositivo. Se actualizará el estado; revisa y vuelve a intentar.');
      conflict.code = error.code;
      throw conflict;
    }
    if (error.code === '42501') {
      throw new Error('Tu rol no tiene permiso para realizar esta acción.');
    }
    throw new Error(error.message || 'No se pudo guardar la acción en la partida.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || !Number.isSafeInteger(data.revision) || !data.data) {
    throw new Error('El servidor devolvió una respuesta de juego inválida.');
  }
  validateGameData(data.data);
  gameStateChannel?.postMessage({ gameId: 'neo_main', revision: data.revision });
  return data;
}

export function createRequestId() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Este navegador no permite crear un identificador seguro para guardar la acción.');
  }
  return globalThis.crypto.randomUUID();
}
