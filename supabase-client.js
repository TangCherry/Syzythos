const SUPABASE_SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm';
let clientPromise;

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
  if (!data || !data.data || typeof data.data !== 'object' || Array.isArray(data.data)) {
    throw new Error('El estado remoto de neo_main no contiene un objeto JSON válido.');
  }
  return data;
}
