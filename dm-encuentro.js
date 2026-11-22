import {
  callGameRpc,
  createRequestId,
  readRemoteGameState,
  subscribeToGameState
} from './supabase-client.js';

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const enemySelect = $('dm-enemy');
  const enemyHp = $('dm-enemy-hp');
  const enemyAtk = $('dm-enemy-atk');
  const enemyAbility = $('dm-enemy-ability');
  const messageInput = $('dm-message');
  const saveButton = $('dm-encounter-save');
  const status = $('dm-encounter-status');
  const encounterUrl = $('dm-encounter-url');
  const copyButton = $('dm-encounter-copy');
  const enemies = window.MUSCULES_ENEMIES;
  let gameState = null;
  let busy = false;
  let loading = false;

  if (!Array.isArray(enemies)) throw new Error('No se pudo cargar el catálogo de enemigos.');

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function makeLink(encounterId) {
    const url = new URL('combate.html', window.location.href);
    url.searchParams.set('encounter', encounterId);
    return url.href;
  }

  function setLink(pointer) {
    encounterUrl.value = pointer?.encounterId ? makeLink(pointer.encounterId) : '';
    copyButton.disabled = !pointer?.encounterId;
  }

  function updateSaveState() {
    const enemy = enemies.find(candidate => candidate.id === enemySelect.value);
    saveButton.disabled = busy || loading || !gameState || !enemy
      || enemy.hp == null || enemy.atk == null || messageInput.value.length > 100;
    saveButton.textContent = busy ? 'Activando…' : 'Activar / reemplazar encuentro';
  }

  function renderSelectedEnemy() {
    const enemy = enemies.find(candidate => candidate.id === enemySelect.value);
    if (!enemy) {
      enemyHp.textContent = '—';
      enemyAtk.textContent = '—';
      enemyAbility.textContent = 'Selecciona un enemigo para ver sus datos.';
      updateSaveState();
      return;
    }
    enemyHp.textContent = enemy.hp ?? 'No definido';
    enemyAtk.textContent = enemy.atk ?? 'No definido';
    enemyAbility.textContent = enemy.ability || 'Sin habilidad descrita.';
    updateSaveState();
  }

  function renderCurrentEncounter({ quiet = false } = {}) {
    const pointer = gameState?.currentEncounter;
    if (!pointer) {
      setLink(null);
      if (!quiet) showStatus('No hay un encuentro activo. Selecciona un enemigo para activarlo.');
      return;
    }
    const enemy = enemies.find(candidate => candidate.id === pointer.enemyId);
    setLink(pointer);
    if (!enemy) {
      showStatus('El encuentro actual apunta a un enemigo que ya no existe en el catálogo.', true);
      return;
    }
    const battle = gameState.battles?.[pointer.encounterId];
    const remaining = Math.max(0, (pointer.expiresAt || battle?.expiresAt || 0) - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor(remaining % 3600000 / 60000);
    if (!quiet) {
      showStatus(
        `Encuentro actual: ${enemy.name} · ${hours} h ${String(minutes).padStart(2, '0')} min restantes. El progreso y las recompensas quedan guardados en Supabase.`
      );
    }
  }

  async function refresh({ quiet = false, force = false } = {}) {
    if (loading || (busy && !force) || document.visibilityState === 'hidden') return;
    loading = true;
    updateSaveState();
    try {
      const previousRevision = gameState?.revision;
      const remote = await readRemoteGameState();
      gameState = remote.data;
      renderCurrentEncounter({ quiet: quiet && previousRevision === gameState.revision });
    } catch (error) {
      gameState = null;
      setLink(null);
      showStatus(error.message || 'No se pudo cargar el estado remoto del encuentro.', true);
    } finally {
      loading = false;
      updateSaveState();
    }
  }

  async function activateEncounter() {
    if (busy || saveButton.disabled || !gameState) return;
    const enemy = enemies.find(candidate => candidate.id === enemySelect.value);
    if (!enemy || enemy.hp == null || enemy.atk == null) return;

    busy = true;
    showStatus('Activando encuentro en Supabase…');
    updateSaveState();
    try {
      const response = await callGameRpc('dm_activate_encounter', {
        p_enemy_id: enemy.id,
        p_dm_message: messageInput.value.trim(),
        p_expected_revision: gameState.revision,
        p_request_id: createRequestId()
      });
      gameState = response.data;
      renderCurrentEncounter({ quiet: true });
      showStatus(`${enemy.name} activado por 24 horas. El enlace ya está disponible.`);
    } catch (error) {
      showStatus(error.message || 'No se pudo activar el encuentro.', true);
      if (error.code === '40001') {
        await refresh({ quiet: true, force: true });
        showStatus(`${error.message} Revisa el estado actualizado antes de volver a intentarlo.`, true);
      }
    } finally {
      busy = false;
      updateSaveState();
    }
  }

  for (const enemy of enemies) {
    const option = document.createElement('option');
    option.value = enemy.id;
    option.textContent = enemy.name;
    option.disabled = enemy.hp == null || enemy.atk == null;
    enemySelect.append(option);
  }

  enemySelect.addEventListener('change', renderSelectedEnemy);
  messageInput.addEventListener('input', updateSaveState);
  saveButton.addEventListener('click', activateEncounter);
  copyButton.addEventListener('click', async () => {
    if (!encounterUrl.value) return;
    try {
      await navigator.clipboard.writeText(encounterUrl.value);
      showStatus('Enlace copiado.');
    } catch (error) {
      console.error('No se pudo copiar el enlace del encuentro.', error);
      encounterUrl.focus();
      encounterUrl.select();
      showStatus('No se pudo copiar automáticamente. Selecciona y copia el enlace del campo.', true);
    }
  });
  window.addEventListener('focus', () => refresh({ quiet: true }));
  document.addEventListener('visibilitychange', () => refresh({ quiet: true }));
  subscribeToGameState(() => refresh({ quiet: true }));
  window.setInterval(() => refresh({ quiet: true }), 10000);
  renderSelectedEnemy();
  refresh();
})();
