import {
  callGameRpc,
  createRequestId,
  readRemoteGameState,
  subscribeToGameState
} from './supabase-client.js';

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const catalog = window.MUSCULES_ENEMIES;
  const itemCatalog = window.MUSCULES_ITEM_CATALOG;
  const itemById = new Map((itemCatalog || []).map(item => [item.id, item]));
  const itemKinds = {
    bola: 'roll_bonus',
    llave: 'escape',
    totem: 'atk_battle',
    encendedor: 'damage',
    ojo: 'hp_bonus',
    maaaake: 'atk_override',
    fuego: 'damage_bonus',
    gatito: 'revive',
    stirfry: 'heal',
    miau: 'revive_half',
    morision: 'instant_kill',
    cumbia: 'heal_full',
    galleta: 'heal_full',
    sherma: 'atk_first',
    gusanito: 'atk_battle',
    vida_extra: 'revive_full'
  };
  const requestedEncounterId = new URLSearchParams(location.search).get('encounter');
  let gameData = null;
  let encounter = null;
  let battle = null;
  let enemy = null;
  let selectedSlot = -1;
  let selectedItemId = null;
  let selectedRevision = null;
  let busy = false;
  let loading = false;
  let appliedStateVersion = 0;
  let expiryRequestedFor = null;
  let lastCounterattackMessage = '';
  let actionError = '';
  let inventorySelectionNotice = '';

  if (!Array.isArray(catalog) || !Array.isArray(itemCatalog)) {
    showNoEncounter('No se pudieron cargar los datos necesarios para mostrar el combate.');
    return;
  }

  function showNoEncounter(message = 'Por el momento no hay encuentro flaquito chulo') {
    closeInventory();
    $('battle').hidden = true;
    $('win').hidden = true;
    $('lose').hidden = true;
    $('waiting').hidden = false;
    $('waiting-message').textContent = actionError || message;
    $('waiting-message').classList.toggle('is-error', Boolean(actionError));
  }

  function showError(message) {
    actionError = message;
  }

  function clearActionError() {
    actionError = '';
    ['log', 'claim-status', 'lose-detail', 'inventory-hint', 'waiting-message']
      .forEach(id => $(id).classList.remove('is-error'));
  }

  function invalidateInventorySelection() {
    selectedSlot = -1;
    selectedItemId = null;
    selectedRevision = null;
    $('inventory-apply').disabled = true;
    inventorySelectionNotice =
      'El estado cambió en otro dispositivo. Vuelve al inventario y selecciona nuevamente el objeto.';
    $('inventory-hint').textContent = inventorySelectionNotice;
  }

  function applyGameData(nextData) {
    if (gameData && nextData.revision < gameData.revision) return false;
    if (selectedSlot >= 0 && nextData.revision !== selectedRevision) {
      invalidateInventorySelection();
    }
    gameData = nextData;
    appliedStateVersion += 1;
    return true;
  }

  function itemKind(id) {
    return itemKinds[id];
  }

  function isRevive(id) {
    return ['revive', 'revive_full', 'revive_half'].includes(itemKind(id));
  }

  function canUse(id) {
    const kind = itemKind(id);
    if (!kind || !battle || !gameData) return false;
    if (isRevive(id)) {
      return battle.status === 'lost' && battle.reason === 'hp' && gameData.hero.hp === 0;
    }
    if (battle.status !== 'active' || battle.itemUsed || gameData.hero.hp <= 0) return false;
    if (kind === 'atk_first' && battle.round !== 0) return false;
    if (['heal', 'heal_full', 'hp_bonus'].includes(kind)) {
      return gameData.hero.hp < gameData.hero.maxHp;
    }
    return true;
  }

  function formatReward() {
    const reward = enemy?.reward;
    if (reward?.type === 'extra_life') return '❤️ Vida extra';
    if (reward?.type === 'item') return itemById.get('cumbia')?.name || 'Poción';
    if (reward?.type === 'random_item') return reward.description || 'Botín aleatorio';
    return `${enemy?.xp ?? 0} XP`;
  }

  function showInventoryGrid() {
    selectedSlot = -1;
    selectedItemId = null;
    selectedRevision = null;
    inventorySelectionNotice = '';
    $('inventory-overlay').hidden = false;
    $('inventory-grid-view').hidden = false;
    $('inventory-detail').hidden = true;
    $('inventory-hint').textContent = '';
    const grid = $('inventory-grid');
    grid.replaceChildren();
    for (let index = 0; index < 15; index++) {
      const id = gameData.inventory[index];
      const item = itemById.get(id);
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'inventory-slot';
      slot.setAttribute('aria-label', item ? item.name : 'Espacio vacío');
      if (item) {
        const image = document.createElement('img');
        image.src = item.icon.split('/').map(encodeURIComponent).join('/');
        image.alt = '';
        slot.append(image);
        slot.disabled = !canUse(id);
        slot.addEventListener('click', () => showItemDetail(index));
      } else {
        slot.disabled = true;
      }
      grid.append(slot);
    }
  }

  function showItemDetail(index) {
    if (!gameData) return;
    const id = gameData.inventory[index];
    const item = itemById.get(id);
    if (!item) return;
    selectedSlot = index;
    selectedItemId = id;
    selectedRevision = gameData.revision;
    inventorySelectionNotice = '';
    $('inventory-grid-view').hidden = true;
    $('inventory-detail').hidden = false;
    const card = $('inventory-card');
    card.replaceChildren();
    if (item.card) {
      const image = document.createElement('img');
      image.src = item.card.split('/').map(encodeURIComponent).join('/');
      image.alt = `Tarjeta: ${item.name}`;
      card.append(image);
    } else {
      const description = document.createElement('p');
      description.textContent = `${item.name} — Revive con HP completo`;
      card.append(description);
    }
    $('inventory-apply').disabled = !canUse(id) || busy;
    $('inventory-hint').textContent = canUse(id) ? '' : 'No se puede utilizar en este momento.';
  }

  function closeInventory() {
    selectedSlot = -1;
    selectedItemId = null;
    selectedRevision = null;
    inventorySelectionNotice = '';
    $('inventory-overlay').hidden = true;
    $('inventory-detail').hidden = true;
    $('inventory-grid-view').hidden = false;
    $('inventory-grid').replaceChildren();
    $('inventory-card').replaceChildren();
    $('inventory-hint').textContent = '';
  }

  function renderHeroHealth() {
    const hero = gameData.hero;
    const ratio = Math.max(0, Math.min(1, hero.hp / hero.maxHp));
    const title = `Neo · ${hero.levelName || 'Neogon'}`;
    const value = `${hero.hp}/${hero.maxHp} HP`;

    document.querySelectorAll('[data-hero-title]').forEach(element => {
      element.textContent = title;
    });
    document.querySelectorAll('[data-hero-hp-value]').forEach(element => {
      element.textContent = value;
    });
    document.querySelectorAll('[data-hero-hp-track]').forEach(track => {
      track.setAttribute('aria-valuenow', String(hero.hp));
      track.setAttribute('aria-valuemax', String(hero.maxHp));
      track.setAttribute('aria-valuetext', `${hero.hp} de ${hero.maxHp} HP`);
      track.querySelector('[data-hero-hp-fill]').style.width = `${ratio * 100}%`;
    });
  }

  function render() {
    if (!gameData || !encounter || !battle || !enemy) {
      showNoEncounter();
      return;
    }
    ['log', 'claim-status', 'lose-detail', 'inventory-hint', 'waiting-message']
      .forEach(id => $(id).classList.remove('is-error'));
    renderHeroHealth();
    document.querySelectorAll('[data-counterattack-message]').forEach(element => {
      element.textContent = lastCounterattackMessage;
    });
    $('waiting').hidden = true;
    const remaining = Math.max(0, battle.expiresAt - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor(remaining % 3600000 / 60000);
    const seconds = Math.floor(remaining % 60000 / 1000);
    $('timer').textContent = [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
    document.querySelector('.timer').classList.toggle('danger', remaining < 3600000);
    $('battle').hidden = battle.status !== 'active';
    $('win').hidden = battle.status !== 'won';
    $('lose').hidden = battle.status !== 'lost';
    $('enemy-name').textContent = enemy.name;
    $('enemy-image').src = enemy.image;
    $('enemy-image').alt = enemy.name;
    $('win-image').src = enemy.image;
    $('lose-image').src = enemy.image;
    $('enemy-atk').textContent = enemy.atk;
    $('enemy-ability').textContent = enemy.ability || 'Sin habilidad descrita.';
    $('enemy-hp').textContent = `${battle.enemyHp}/${enemy.hp}`;
    $('enemy-bar').style.width = `${100 * Math.min(1, Math.max(0, battle.enemyHp / enemy.hp))}%`;
    $('log').textContent = battle.message || '';
    $('dm-message').textContent = encounter.dmMessage || '';
    $('dm-message').hidden = !$('dm-message').textContent;
    $('reward-xp').textContent = formatReward();
    $('roll').disabled = busy || battle.status !== 'active' || gameData.hero.hp <= 0;
    const needsSpace = battle.status === 'won'
      && !battle.claimed
      && ['extra_life', 'item', 'random_item'].includes(enemy.reward?.type);
    const inventoryFull = needsSpace && gameData.inventory.length >= 15;
    $('claim').disabled = busy || battle.status !== 'won' || battle.claimed || inventoryFull;
    $('claim').textContent = battle.claimed ? 'Reclamado ✓' : busy ? 'Guardando…' : 'Reclamar';
    $('claim-status').textContent = battle.claimed
      ? battle.rewardMessage || 'Recompensa reclamada.'
      : inventoryFull ? 'Inventario lleno: libera un espacio para reclamar esta recompensa.' : battle.rewardMessage || '';
    $('revive-button').hidden = !(
      battle.status === 'lost'
      && battle.reason === 'hp'
      && gameData.hero.hp === 0
      && gameData.inventory.some(isRevive)
    );
    $('revive-button').disabled = busy;
    $('inventory-toggle').disabled = busy || !gameData.inventory.some(canUse);
    const itemSelectionValid = selectedSlot >= 0
      && selectedRevision === gameData.revision
      && gameData.inventory[selectedSlot] === selectedItemId;
    $('inventory-apply').disabled = busy || !itemSelectionValid
      || !canUse(gameData.inventory[selectedSlot]);
    $('lose').querySelector('h1').textContent = battle.reason === 'escape' ? 'Huida' : 'Derrota';
    $('lose-reason').textContent = battle.reason === 'escape'
      ? 'Escapó' : battle.reason === 'time' ? 'Tiempo agotado'
        : battle.reason === 'lapida' ? 'Derrotado por Lápida'
          : battle.reason === 'legacy' ? 'Reinicia esta prueba' : 'Fallecido';
    $('lose-detail').textContent = battle.reason === 'escape'
      ? 'Neo utilizó la Llave de fuga' : battle.reason === 'time'
        ? `${enemy.name} escapó · Sin penalización de XP`
        : battle.reason === 'lapida'
          ? `Se agotó tu HP disponible · Conservas ${gameData.hero.hp}/${gameData.hero.maxHp} HP reales`
          : battle.reason === 'legacy' ? 'Prueba anterior incompatible'
            : gameData.hero.hp > 0
              ? `Neo volvió con ${gameData.hero.hp}/${gameData.hero.maxHp} HP. La derrota es permanente; Cherry puede activar un nuevo encuentro.`
              : '0 HP · Esperando a Cherry para revivir';
    if (actionError) {
      const target = !$('inventory-overlay').hidden
        ? $('inventory-hint')
        : battle.status === 'won'
          ? $('claim-status')
          : battle.status === 'lost'
              ? $('lose-detail')
              : $('log');
      target.textContent = target === $('inventory-hint')
        ? [actionError, inventorySelectionNotice].filter(Boolean).join(' ')
        : actionError;
      target.classList.add('is-error');
    }
  }

  async function refresh({ quiet = false, force = false } = {}) {
    if (loading || (busy && !force) || document.visibilityState === 'hidden') return;
    const stateVersionAtStart = appliedStateVersion;
    loading = true;
    try {
      const remote = await readRemoteGameState();
      if (gameData && (remote.data.revision < gameData.revision
        || (appliedStateVersion !== stateVersionAtStart
          && remote.data.revision <= gameData.revision))) return;
      if (!applyGameData(remote.data)) return;
      encounter = gameData.currentEncounter;
      if (requestedEncounterId && encounter?.encounterId !== requestedEncounterId) {
        const historicBattle = gameData.battles?.[requestedEncounterId];
        if (historicBattle?.status === 'won') {
          battle = historicBattle;
          encounter = {
            enemyId: historicBattle.enemyId,
            encounterId: historicBattle.encounterId,
            startedAt: historicBattle.startedAt,
            expiresAt: historicBattle.expiresAt,
            dmMessage: ''
          };
        } else {
          battle = null;
          enemy = null;
          showNoEncounter(encounter
            ? 'Este enlace ya no corresponde al encuentro activo de Cherry.'
            : undefined);
          return;
        }
      } else if (!encounter) {
        battle = null;
        enemy = null;
        showNoEncounter();
        return;
      }
      battle = gameData.battles?.[encounter.encounterId] || null;
      const catalogEntry = catalog.find(candidate => candidate.id === encounter.enemyId);
      const snapshot = battle?.enemySnapshot;
      if (!battle || battle.encounterId !== encounter.encounterId || !catalogEntry || !snapshot) {
        battle = null;
        enemy = null;
        showNoEncounter('No se encontró un estado de batalla válido en Supabase.');
        return;
      }
      enemy = {
        ...catalogEntry,
        ...snapshot,
        image: catalogEntry.image,
        ability: catalogEntry.ability
      };
      render();
      if (!quiet) {
        $('log').classList.remove('is-error');
        $('claim-status').classList.remove('is-error');
      }
    } catch (error) {
      if (appliedStateVersion !== stateVersionAtStart) return;
      gameData = null;
      encounter = null;
      battle = null;
      enemy = null;
      showNoEncounter(error.message || 'No se pudo cargar el combate desde Supabase.');
    } finally {
      loading = false;
    }
  }

  async function performAction(operation, extraArgs = {}) {
    if (busy || !gameData || !encounter || !battle) return null;
    if (operation === 'player_use_item'
      && (extraArgs.p_slot !== selectedSlot
        || selectedRevision !== gameData.revision
        || gameData.inventory[selectedSlot] !== selectedItemId)) {
      invalidateInventorySelection();
      render();
      return null;
    }
    const actionEncounterId = encounter.encounterId;
    clearActionError();
    lastCounterattackMessage = '';
    busy = true;
    render();
    try {
      const response = await callGameRpc(operation, {
        ...extraArgs,
        p_encounter_id: actionEncounterId,
        p_expected_revision: gameData.revision,
        p_request_id: createRequestId()
      });
      if (applyGameData(response.data)) {
        battle = gameData.battles?.[actionEncounterId] || null;
        encounter = gameData.currentEncounter?.encounterId === actionEncounterId
          ? gameData.currentEncounter
          : battle?.status === 'won'
            ? {
              enemyId: battle.enemyId,
              encounterId: battle.encounterId,
              startedAt: battle.startedAt,
              expiresAt: battle.expiresAt,
              dmMessage: ''
            }
            : gameData.currentEncounter;
        const catalogEntry = catalog.find(candidate => candidate.id === encounter?.enemyId);
        enemy = catalogEntry && battle?.enemySnapshot
          ? { ...catalogEntry, ...battle.enemySnapshot, image: catalogEntry.image, ability: catalogEntry.ability }
          : null;
      }
      if (operation === 'player_combat_turn') {
        const damage = response.result?.enemyDamage;
        lastCounterattackMessage = Number.isSafeInteger(damage) && damage > 0
          ? `Contraataque: Neo recibió ${damage} HP de daño.`
          : damage === 0
            ? 'Sin daño de contraataque a Neo.'
            : 'No hubo contraataque en este turno.';
      }
      if (battle && enemy) render();
      else showNoEncounter();
      $('log').classList.remove('is-error');
      $('claim-status').classList.remove('is-error');
      return response;
    } catch (error) {
      showError(error.message || 'No se pudo guardar la acción de combate.');
      if (error.code === '40001') {
        await refresh({ quiet: true, force: true });
        showError(error.message);
      }
      return null;
    } finally {
      busy = false;
      render();
    }
  }

  $('roll').addEventListener('click', () => {
    void performAction('player_combat_turn');
  });
  $('claim').addEventListener('click', () => {
    void performAction('player_claim_reward');
  });
  $('revive-button').addEventListener('click', showInventoryGrid);
  $('inventory-toggle').addEventListener('click', () => {
    if (gameData?.inventory.some(canUse)) showInventoryGrid();
  });
  $('inventory-close').addEventListener('click', closeInventory);
  $('inventory-detail-close').addEventListener('click', showInventoryGrid);
  $('inventory-overlay').addEventListener('click', event => {
    if (event.target === $('inventory-overlay')) closeInventory();
  });
  $('inventory-detail').addEventListener('click', event => {
    if (event.target === $('inventory-detail')) closeInventory();
  });
  $('inventory-apply').addEventListener('click', () => {
    if (selectedSlot < 0) return;
    const response = performAction('player_use_item', { p_slot: selectedSlot });
    void response.then(result => { if (result) closeInventory(); });
  });

  async function settleExpiredEncounter() {
    const encounterId = encounter?.encounterId;
    if (!encounterId || expiryRequestedFor === encounterId || busy || battle?.status !== 'active'
      || Date.now() < (battle.expiresAt || 0)) return;
    expiryRequestedFor = encounterId;
    const result = await performAction('player_combat_turn');
    if (!result && expiryRequestedFor === encounterId) {
      expiryRequestedFor = null;
    }
  }

  window.addEventListener('focus', () => refresh({ quiet: true }));
  document.addEventListener('visibilitychange', () => refresh({ quiet: true }));
  subscribeToGameState(() => refresh({ quiet: true }));
  window.setInterval(() => {
    if (battle?.status === 'active' && Date.now() >= (battle.expiresAt || 0)) {
      void settleExpiredEncounter();
    } else {
      render();
    }
  }, 1000);
  window.setInterval(() => refresh({ quiet: true }), 10000);
  showNoEncounter('Cargando el encuentro desde Supabase…');
  refresh();
})();
