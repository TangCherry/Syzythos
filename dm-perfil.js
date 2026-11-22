import {
  callGameRpc,
  createRequestId,
  readRemoteGameState,
  subscribeToGameState
} from './supabase-client.js';

(() => {
  'use strict';

  const XP_PER_LEVEL = 1000;
  const $ = id => document.getElementById(id);
  const editButton = document.querySelector('.dm-profile-edit');
  const saveButton = $('dm-profile-save');
  const status = $('dm-profile-status');
  const numericFields = {
    hp: $('dm-hp'),
    maxHp: $('dm-max-hp'),
    atk: $('dm-atk'),
    xp: $('dm-xp')
  };
  const metadataFields = ['dm-weapon', 'dm-sign', 'dm-level-name']
    .map(id => $(id));
  let gameState = null;
  let editSnapshot = null;
  let editing = false;
  let loading = false;
  let saving = false;
  let editConflict = false;

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function render(hero) {
    const hpMax = Math.max(0, hero.maxHp);
    const hp = Math.max(0, hero.hp);
    const xp = Math.max(0, hero.xp);
    const xpProgress = (xp % XP_PER_LEVEL) / XP_PER_LEVEL;
    document.querySelector('.dm-meter-fill--hp').style.width =
      `${hpMax > 0 ? Math.min(1, hp / hpMax) * 100 : 0}%`;
    document.querySelector('.dm-meter-fill--xp').style.width = `${xpProgress * 100}%`;
    $('dm-hp-value').textContent = `${hero.hp}/${hero.maxHp}`;
    $('dm-xp-value').textContent =
      `${new Intl.NumberFormat('es-MX').format(xp)}/${new Intl.NumberFormat('es-MX').format((Math.floor(xp / XP_PER_LEVEL) + 1) * XP_PER_LEVEL)}`;
    $('dm-atk-value').textContent = String(hero.atk);
    $('dm-weapon-value').textContent = hero.weapon || '—';
    $('dm-sign-value').textContent = hero.sign || '—';
    $('dm-level-name-value').textContent = hero.levelName || '—';
    for (const [name, field] of Object.entries(numericFields)) field.value = String(hero[name]);
    saveButton.disabled = true;
    saveButton.classList.remove('is-dirty');
  }

  function setEditing(value) {
    editing = value;
    if (!editing) editConflict = false;
    document.querySelectorAll('.dm-profile-edit-inputs').forEach(element => {
      element.hidden = !editing;
    });
    document.querySelectorAll('.dm-profile-meter, .dm-profile-atk > span:last-of-type')
      .forEach(element => { element.hidden = editing; });
    for (const field of Object.values(numericFields)) {
      field.hidden = !editing;
      field.disabled = !editing || saving;
    }
    document.querySelectorAll('.dm-profile-edit-input').forEach(element => {
      element.hidden = !editing;
    });
    for (const field of metadataFields) {
      field.hidden = true;
      field.disabled = true;
    }
    editButton.setAttribute('aria-label', editing ? 'Cancelar edición' : 'Editar perfil de Neo');
    editButton.title = editing ? 'Cancelar edición' : 'Editar perfil';
    editButton.disabled = !gameState || saving;
    saveButton.disabled = !editing || !hasChanges() || saving || editConflict;
    saveButton.classList.toggle('is-dirty', editing && hasChanges() && !saving && !editConflict);
    if (editing) {
      editConflict = false;
      editSnapshot = {
        hp: gameState.hero.hp,
        maxHp: gameState.hero.maxHp,
        atk: gameState.hero.atk,
        xp: gameState.hero.xp
      };
      for (const [name, field] of Object.entries(numericFields)) field.value = String(editSnapshot[name]);
      showStatus('Edita HP, ATK y XP. Arma, signo y nivel son de solo lectura.');
    }
  }

  function readDraft() {
    const draft = {};
    for (const [name, field] of Object.entries(numericFields)) {
      const raw = field.value.trim();
      const value = Number(raw);
      if (!raw || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${name === 'maxHp' ? 'El HP máximo' : name.toUpperCase()} debe ser un entero no negativo.`);
      }
      draft[name] = value;
    }
    if (draft.maxHp < 1) throw new Error('El HP máximo debe ser al menos 1.');
    if (draft.hp > draft.maxHp) throw new Error('El HP actual no puede superar el HP máximo.');
    return draft;
  }

  function hasChanges() {
    return Boolean(editSnapshot) && Object.entries(numericFields).some(([name, field]) =>
      Number(field.value) !== editSnapshot[name]);
  }

  async function refresh({ quiet = false } = {}) {
    if (loading || saving || document.visibilityState === 'hidden') return;
    loading = true;
    try {
      const remote = await readRemoteGameState();
      const revisionChanged = Boolean(gameState && remote.data.revision !== gameState.revision);
      gameState = remote.data;
      if (!editing) {
        render(gameState.hero);
        setEditing(false);
        if (!quiet) showStatus('Perfil cargado desde Supabase.');
      } else if (revisionChanged) {
        editConflict = true;
        showStatus('Neo recibió cambios desde otro dispositivo; tus cambios siguen pendientes.', true);
        updateSaveState();
      }
    } catch (error) {
      if (!gameState) {
        editButton.disabled = true;
        saveButton.disabled = true;
      }
      showStatus(error.message || 'No se pudo cargar el perfil remoto.', true);
    } finally {
      loading = false;
    }
  }

  async function saveChanges() {
    if (!editing || saving || saveButton.disabled || !gameState || editConflict) return;
    let draft;
    try {
      draft = readDraft();
    } catch (error) {
      showStatus(error.message, true);
      return;
    }

    saving = true;
    saveButton.disabled = true;
    editButton.disabled = true;
    for (const field of Object.values(numericFields)) field.disabled = true;
    showStatus('Guardando cambios en Supabase…');
    try {
      const response = await callGameRpc('dm_update_hero', {
        p_hp: draft.hp,
        p_max_hp: draft.maxHp,
        p_atk: draft.atk,
        p_xp: draft.xp,
        p_expected_revision: gameState.revision,
        p_request_id: createRequestId()
      });
      gameState = response.data;
      render(gameState.hero);
      setEditing(false);
      showStatus('Cambios guardados correctamente.');
    } catch (error) {
      showStatus(error.message || 'No se pudieron guardar los cambios.', true);
      if (error.code === '40001') {
        try {
          const remote = await readRemoteGameState();
          gameState = remote.data;
          editing = false;
          editSnapshot = null;
          render(gameState.hero);
          setEditing(false);
          showStatus('La partida cambió en otro dispositivo. Se cargaron los datos más recientes; revisa antes de volver a editar.', true);
        } catch (refreshError) {
          showStatus(`${error.message} No se pudo recargar el último estado: ${refreshError.message}`, true);
        }
      }
    } finally {
      saving = false;
      editButton.disabled = !gameState;
      for (const field of Object.values(numericFields)) field.disabled = !editing;
      updateSaveState();
    }
  }

  function updateSaveState() {
    const changed = hasChanges();
    saveButton.disabled = !editing || !changed || saving || editConflict;
    saveButton.classList.toggle('is-dirty', editing && changed && !saving && !editConflict);
  }

  editButton.addEventListener('click', () => {
    if (!gameState || saving) return;
    if (editing) {
      setEditing(false);
      render(gameState.hero);
      showStatus('Edición cancelada.');
    } else {
      setEditing(true);
    }
  });
  for (const field of Object.values(numericFields)) field.addEventListener('input', updateSaveState);
  saveButton.addEventListener('click', saveChanges);
  window.addEventListener('focus', () => refresh({ quiet: true }));
  document.addEventListener('visibilitychange', () => refresh({ quiet: true }));
  subscribeToGameState(() => refresh({ quiet: true }));
  window.setInterval(() => refresh({ quiet: true }), 10000);

  editButton.disabled = true;
  saveButton.disabled = true;
  metadataFields.forEach(field => { field.hidden = true; field.disabled = true; });
  refresh();
})();
