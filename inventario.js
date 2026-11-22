import { readRemoteGameState, subscribeToGameState } from './supabase-client.js';

(() => {
  'use strict';

  const catalog = window.MUSCULES_ITEM_CATALOG;
  const itemById = new Map((catalog || []).map(item => [item.id, item]));
  const grid = document.getElementById('inventory-grid');
  const dialog = document.getElementById('item-dialog');
  const closeButton = dialog.querySelector('.close');
  const itemTitle = document.getElementById('item-title');
  const itemCard = document.getElementById('item-card');
  const deleteButton = document.getElementById('item-delete');
  const status = document.getElementById('gift-status');
  let gameState = null;
  let loading = false;

  function assetUrl(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function showError(error) {
    status.textContent = error.message || 'No se pudo cargar el inventario de Neo.';
    status.hidden = false;
    status.classList.add('is-error');
  }

  function renderInventory(inventory) {
    grid.replaceChildren();
    for (let index = 0; index < 15; index++) {
      const id = inventory[index];
      const item = itemById.get(id);
      if (id && !item) throw new Error('El inventario remoto contiene un objeto no reconocido.');
      const slot = document.createElement('button');
      slot.className = 'slot';
      slot.type = 'button';

      if (item) {
        const image = document.createElement('img');
        image.src = assetUrl(item.icon);
        image.alt = '';
        slot.append(image);
        slot.setAttribute('aria-label', `${item.name}, espacio ${index + 1}`);
        slot.addEventListener('click', () => {
          itemTitle.textContent = item.name;
          itemCard.src = assetUrl(item.card);
          itemCard.alt = `Tarjeta de ${item.name} con su habilidad`;
          dialog.showModal();
        });
      } else {
        slot.disabled = true;
        slot.setAttribute('aria-label', 'Espacio vacío');
      }
      grid.append(slot);
    }
  }

  async function refresh() {
    if (loading || document.visibilityState === 'hidden') return;
    loading = true;
    try {
      const remote = await readRemoteGameState();
      gameState = remote.data;
      renderInventory(gameState.inventory);
      status.hidden = true;
      status.classList.remove('is-error');
    } catch (error) {
      showError(error);
    } finally {
      loading = false;
    }
  }

  if (!Array.isArray(catalog)) throw new Error('No se pudo cargar el catálogo de objetos.');
  deleteButton.hidden = true;
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  subscribeToGameState(refresh);
  window.setInterval(refresh, 10000);
  refresh();
})();
