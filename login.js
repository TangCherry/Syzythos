import { getCurrentSession, getSupabaseClient, getUserRole } from './supabase-client.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const submitButton = document.getElementById('login-submit');
const status = document.getElementById('login-status');
const activeSession = document.getElementById('active-session');
const continueLink = document.getElementById('continue-link');
const logoutButton = document.getElementById('logout-button');
const params = new URLSearchParams(location.search);
const DM_PAGES = new Set(['dm.html', 'dm-perfil.html', 'dm-inventario.html', 'dm-encuentro.html']);
const PLAYER_PAGES = new Set(['index.html', 'perfil.html', 'inventario.html', 'combate.html']);
const ALLOWED_PAGES = new Set([
  ...DM_PAGES,
  ...PLAYER_PAGES,
  'diagnostico.html'
]);

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function safeNextPage() {
  const requested = params.get('next');
  if (!requested) return null;

  try {
    const target = new URL(requested, location.href);
    const page = target.pathname.split('/').pop();
    return target.origin === location.origin && ALLOWED_PAGES.has(page) ? target : null;
  } catch {
    return null;
  }
}

function landingPage(role) {
  if (role === 'dm') return 'dm.html';
  if (role === 'player') return 'index.html';
  throw new Error('No se pudo determinar una página de inicio para el rol autenticado.');
}

function destinationFor(role) {
  const landing = landingPage(role);
  const target = safeNextPage();
  if (!target) return new URL(landing, location.href);
  const targetPage = target.pathname.split('/').pop();
  const roleMismatch = role === 'dm'
    ? PLAYER_PAGES.has(targetPage)
    : DM_PAGES.has(targetPage);
  return roleMismatch ? new URL(landing, location.href) : target;
}

function showActiveSession(role) {
  form.hidden = true;
  activeSession.hidden = false;
  continueLink.href = destinationFor(role).href;
  continueLink.textContent = role === 'dm' ? 'Continuar como Cherry' : 'Continuar como Neo';
}

async function showExistingSession() {
  if (params.get('reason') === 'role') {
    showStatus('Esta cuenta no tiene permiso para abrir la página DM solicitada.', true);
  }

  const session = await getCurrentSession();
  if (!session) return;
  showActiveSession(await getUserRole(session.user?.id));
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitButton.disabled) return;

  submitButton.disabled = true;
  showStatus('Verificando…');
  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    if (error) throw new Error(`No se pudo iniciar sesión: ${error.message}`);
    if (!data.session?.user?.id) throw new Error('Supabase Auth no devolvió una sesión válida.');

    let role;
    try {
      role = await getUserRole(data.session.user.id);
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }

    const destination = destinationFor(role);
    const targetPage = destination.pathname.split('/').pop();
    if (DM_PAGES.has(targetPage) && role !== 'dm') {
      showActiveSession(role);
      showStatus('La cuenta inició sesión, pero no tiene permiso para abrir páginas DM.', true);
      return;
    }
    location.replace(destination.href);
  } catch (error) {
    console.error('No se pudo iniciar sesión.', error);
    showStatus(error.message || 'No se pudo iniciar sesión. Inténtalo de nuevo.', true);
  } finally {
    passwordInput.value = '';
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    const client = await getSupabaseClient();
    const { error } = await client.auth.signOut();
    if (error) throw new Error(`No se pudo cerrar sesión: ${error.message}`);
    activeSession.hidden = true;
    form.hidden = false;
    emailInput.value = '';
    passwordInput.value = '';
    showStatus('Sesión cerrada.');
  } catch (error) {
    console.error('No se pudo cerrar sesión.', error);
    showStatus(error.message || 'No se pudo cerrar sesión.', true);
  } finally {
    logoutButton.disabled = false;
  }
});

showExistingSession().catch(error => {
  console.error('No se pudo comprobar la sesión actual.', error);
  showStatus(error.message || 'No se pudo comprobar la sesión actual.', true);
});
