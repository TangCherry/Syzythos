import {
  callGameRpc,
  createRequestId,
  readRemoteGameState,
  subscribeToGameState
} from './supabase-client.js';

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const itemSelect = $('dm-item');
  const itemAbility = $('dm-item-ability');
  const messageInput = $('dm-message');
  const saveButton = $('dm-inventory-save');
  const removeSlot = $('dm-remove-slot');
  const removeButton = $('dm-inventory-remove');
  const status = $('dm-inventory-status');
  const catalog = window.MUSCULES_ITEM_CATALOG;
  const itemById = new Map((catalog || []).map(item => [item.id, item]));
  let gameState = null;
  let busy = false;
  let loading = false;

  if (!Array.isArray(catalog)) throw new Error('No se pudo cargar el catálogo de objetos.');

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function renderInventory({ quiet = false } = {}) {
    const inventory = gameState?.inventory || [];
    const full = inventory.length >= 15;
    saveButton.disabled = busy || loading || !gameState || full
      || !itemById.has(itemSelect.value) || messageInput.value.length > 100;
    saveButton.textContent = busy ? 'Guardando…' : full ? 'Inventario lleno' : 'Guardar';
    removeSlot.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = inventory.length ? 'Seleccionar objeto' : 'El inventario está vacío';
    placeholder.selected = true;
    removeSlot.append(placeholder);
    inventory.forEach((id, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${itemById.get(id)?.name || id} · espacio ${index + 1}`;
      removeSlot.append(option);
    });
    removeSlot.disabled = busy || loading || inventory.length === 0;
    removeButton.disabled = busy || loading || !gameState || inventory.length === 0;
    removeButton.textContent = busy ? 'Guardando…' : 'Retirar';
    if (!quiet) showStatus(`Objetos: ${inventory.length}/15`);
  }

  async function refresh({ quiet = false, force = false } = {}) {
    if (loading || (busy && !force) || document.visibilityState === 'hidden') return;
    loading = true;
    renderInventory({ quiet: true });
    try {
      const remote = await readRemoteGameState();
      const changed = !gameState || remote.data.revision !== gameState.revision;
      gameState = remote.data;
      renderInventory({ quiet: quiet && !changed });
      if (changed && quiet) showStatus(`Inventario actualizado: ${gameState.inventory.length}/15.`);
    } catch (error) {
      gameState = null;
      renderInventory({ quiet: true });
      showStatus(error.message || 'No se pudo cargar el inventario remoto.', true);
    } finally {
      loading = false;
      renderInventory({ quiet: true });
    }
  }

  async function perform(action, args, successMessage) {
    if (busy || !gameState) return;
    busy = true;
    renderInventory({ quiet: true });
    showStatus('Guardando inventario en Supabase…');
    try {
      const response = await callGameRpc(action, {
        ...args,
        p_expected_revision: gameState.revision,
        p_request_id: createRequestId()
      });
      gameState = response.data;
      renderInventory({ quiet: true });
      showStatus(successMessage);
    } catch (error) {
      if (error.code === '40001') {
        await refresh({ quiet: true, force: true });
        showStatus(`${error.message} Revisa el inventario actualizado antes de volver a intentarlo.`, true);
      } else {
        showStatus(error.message || 'No se pudo actualizar el inventario.', true);
      }
    } finally {
      busy = false;
      renderInventory({ quiet: true });
    }
  }

  for (const item of catalog) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    itemSelect.append(option);
  }
  itemSelect.addEventListener('change', () => {
    const item = itemById.get(itemSelect.value);
    itemAbility.textContent = item?.ability ?? 'Selecciona un objeto para ver su habilidad.';
    renderInventory({ quiet: true });
  });
  messageInput.addEventListener('input', () => {
    renderInventory({ quiet: true });
  });
  saveButton.addEventListener('click', () => {
    const item = itemById.get(itemSelect.value);
    if (!item || messageInput.value.length > 100) return;
    const message = messageInput.value.trim();
    void perform(
      'dm_grant_item',
      { p_item_id: item.id },
      message
        ? `${item.name} entregado. Las notas de regalo aún no se sincronizan con el servidor.`
        : `${item.name} entregado a Neo.`
    ).then(() => {
      if (status.classList.contains('is-error')) return;
      itemSelect.value = '';
      messageInput.value = '';
      itemAbility.textContent = 'Selecciona un objeto para ver su habilidad.';
      renderInventory({ quiet: true });
    });
  });
  removeButton.addEventListener('click', () => {
    if (removeSlot.value === '') return;
    const slot = Number(removeSlot.value);
    if (!Number.isSafeInteger(slot) || slot < 0) return;
    const item = gameState?.inventory[slot];
    if (!item) return;
    void perform(
      'dm_remove_item',
      { p_slot: slot },
      `${itemById.get(item)?.name || item} retirado del inventario de Neo.`
    );
  });

  window.addEventListener('focus', () => refresh({ quiet: true }));
  document.addEventListener('visibilitychange', () => refresh({ quiet: true }));
  subscribeToGameState(() => refresh({ quiet: true }));
  window.setInterval(() => refresh({ quiet: true }), 10000);
  saveButton.disabled = true;
  removeButton.disabled = true;
  refresh();
})();
