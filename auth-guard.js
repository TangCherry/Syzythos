import { getCurrentSession, getSupabaseClient, getUserRole } from './supabase-client.js';

const body = document.body;
const requiredRole = body.dataset.authRequired;
const next = `${location.pathname}${location.search}${location.hash}`;
const loginUrl = reason => {
  const url = new URL('login.html', location.href);
  url.searchParams.set('next', next);
  if (reason) url.searchParams.set('reason', reason);
  return url.href;
};

function showGuardError(error) {
  console.error('No se pudo verificar el acceso a esta página.', error);
  const message = document.createElement('main');
  message.className = 'auth-error';
  message.setAttribute('role', 'alert');

  const heading = document.createElement('h1');
  heading.textContent = 'No se pudo verificar el acceso';
  const detail = document.createElement('p');
  detail.textContent = error.message || 'Ocurrió un error al validar la sesión.';
  const link = document.createElement('a');
  link.href = 'login.html';
  link.textContent = 'Ir al inicio de sesión';

  message.append(heading, detail, link);
  body.prepend(message);
  body.dataset.authBlocked = 'true';
  body.dataset.authReady = 'true';
}

function attachHomeSignOut() {
  const button = body.querySelector('[data-auth-signout]');
  const errorMessage = body.querySelector('[data-auth-signout-error]');
  if (!button || !errorMessage) return;

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    errorMessage.hidden = true;
    errorMessage.textContent = '';
    try {
      const client = await getSupabaseClient();
      const { error } = await client.auth.signOut();
      if (error) throw new Error(`No se pudo cerrar sesión: ${error.message}`);
      location.replace('login.html');
    } catch (error) {
      console.error('No se pudo cerrar sesión.', error);
      errorMessage.textContent = error.message || 'No se pudo cerrar sesión. Inténtalo de nuevo.';
      errorMessage.hidden = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
}

try {
  const session = await getCurrentSession();
  if (!session) {
    location.replace(loginUrl());
  } else if (requiredRole === 'dm' || requiredRole === 'player') {
    const role = await getUserRole(session.user?.id);
    if (role !== requiredRole) {
      location.replace(loginUrl('role'));
    } else {
      body.dataset.authReady = 'true';
      attachHomeSignOut();
    }
  } else {
    body.dataset.authReady = 'true';
    attachHomeSignOut();
  }
} catch (error) {
  showGuardError(error);
}
