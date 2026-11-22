import { readRemoteGameState, subscribeToGameState } from './supabase-client.js';

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const statsPanel = document.querySelector('.stats');
  const status = document.getElementById('profile-status');
  let loading = false;
  let lastUpdatedAt = null;
  statsPanel.hidden = true;

  function showError(error) {
    status.textContent = error.message || 'No se pudo cargar el perfil de Neo.';
    status.hidden = false;
    status.classList.add('is-error');
    statsPanel.hidden = true;
  }

  function render(stats) {
    const hpMax = stats.maxHp;
    const hpCurrent = stats.hp;
    const hpProgress = hpMax > 0 ? Math.min(1, hpCurrent / hpMax) : 0;
    const totalXp = stats.xp;
    const level = Math.floor(totalXp / 1000);
    const xpWithinLevel = totalXp % 1000;
    const xpProgress = xpWithinLevel / 1000;

    $('hp-meter').setAttribute('aria-valuemax', String(hpMax));
    $('hp-meter').setAttribute('aria-valuenow', String(Math.min(hpMax, hpCurrent)));
    $('hp-fill').style.width = `${hpProgress * 100}%`;
    $('hp-value').textContent = `${hpCurrent}/${hpMax}`;
    $('atk-value').textContent = String(stats.atk);
    $('xp-meter').setAttribute('aria-valuenow', String(xpWithinLevel));
    $('xp-meter').setAttribute('aria-valuetext', `${totalXp} XP acumulados`);
    $('xp-fill').style.width = `${xpProgress * 100}%`;
    $('xp-value').textContent = `${new Intl.NumberFormat('es-MX').format(totalXp)} XP`;
    $('level-number').textContent = String(level);
    $('weapon-value').textContent = stats.weapon || '—';
    $('sign-value').textContent = stats.sign || '—';
    $('level-name').textContent = stats.levelName || '—';
    statsPanel.hidden = false;
    status.hidden = true;
    status.classList.remove('is-error');
  }

  async function refresh() {
    if (loading || document.visibilityState === 'hidden') return;
    loading = true;
    try {
      const remote = await readRemoteGameState();
      if (remote.updated_at !== lastUpdatedAt) {
        lastUpdatedAt = remote.updated_at;
        render(remote.data.hero);
      }
    } catch (error) {
      showError(error);
    } finally {
      loading = false;
    }
  }

  refresh();
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  subscribeToGameState(refresh);
  window.setInterval(refresh, 10000);
})();
