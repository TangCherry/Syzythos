import { getCurrentSession, getUserRole, readRemoteGameState } from './supabase-client.js';

const status = document.getElementById('diagnostic-status');
const results = document.getElementById('diagnostic-results');
const retryButton = document.getElementById('diagnostic-retry');

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function displayNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`El campo remoto ${label} no es un número válido.`);
  }
  return String(value);
}

function displayText(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`El campo remoto ${label} no es texto válido.`);
  }
  return value;
}

async function loadDiagnostics() {
  retryButton.disabled = true;
  results.hidden = true;
  showStatus('Consultando Supabase…');
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) throw new Error('No hay una sesión autenticada.');

    const [role, state] = await Promise.all([
      getUserRole(session.user.id),
      readRemoteGameState()
    ]);
    const hero = state.data.hero;
    if (!hero || typeof hero !== 'object' || Array.isArray(hero)) {
      throw new Error('game_state.data.hero no contiene las estadísticas esperadas.');
    }

    document.getElementById('diagnostic-role').textContent = role;
    document.getElementById('diagnostic-game').textContent = state.id;
    document.getElementById('diagnostic-updated').textContent = state.updated_at || 'Sin fecha';
    document.getElementById('diagnostic-hp').textContent = displayNumber(hero.hp, 'HP');
    document.getElementById('diagnostic-max-hp').textContent = displayNumber(hero.maxHp, 'maxHp');
    document.getElementById('diagnostic-atk').textContent = displayNumber(hero.atk, 'ATK');
    document.getElementById('diagnostic-xp').textContent = displayNumber(hero.xp, 'XP');
    document.getElementById('diagnostic-weapon').textContent = displayText(hero.weapon, 'weapon');
    document.getElementById('diagnostic-sign').textContent = displayText(hero.sign, 'sign');
    document.getElementById('diagnostic-level').textContent = displayText(hero.levelName, 'levelName');

    results.hidden = false;
    showStatus(`Lectura remota correcta para el rol ${role}. No se modificaron datos.`);
  } catch (error) {
    console.error('Falló la lectura remota de diagnóstico.', error);
    showStatus(error.message || 'No se pudo leer el estado remoto.', true);
  } finally {
    retryButton.disabled = false;
  }
}

retryButton.addEventListener('click', loadDiagnostics);
loadDiagnostics();
