(() => {
  const ROLE_KEY = 'muscules_playwright_mock_role';
  const SESSION_KEY = 'muscules_playwright_mock_session';
  const QUERY_KEY = 'muscules_playwright_mock_queries';
  try {
    window.MUSCULES_SUPABASE_TEST_QUERIES = JSON.parse(sessionStorage.getItem(QUERY_KEY) || '[]');
  } catch {
    window.MUSCULES_SUPABASE_TEST_QUERIES = [];
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
              return { data: null, error: { message: 'No existe la partida de prueba.' } };
            }
            return {
              data: {
                id: 'neo_main',
                updated_at: '2026-11-20T00:00:00.000Z',
                data: {
                  hero: {
                    hp: 28,
                    maxHp: 28,
                    atk: 35,
                    xp: 9750,
                    weapon: 'Gancho',
                    sign: 'Sagitario',
                    levelName: 'Neogon'
                  }
                }
              },
              error: null
            };
          }
        };
      }
    };
  }

  window.MUSCULES_SUPABASE_TEST_ADAPTER = Object.freeze({ createClient });
})();
