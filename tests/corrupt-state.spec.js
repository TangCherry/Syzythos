const { test, expect } = require('@playwright/test');
const { BATTLE_PREFIX, POINTER_KEY, pointer, seedStorage } = require('./support');

const enemyId = 'carrotnero';
const encounterId = 'qa-corrupt-state';
const battleKey = BATTLE_PREFIX + enemyId;

for (const scenario of [
  {
    name: 'JSON inválido',
    stored: '{malformed',
    message: 'JSON inválido'
  },
  {
    name: 'estructura incompleta',
    stored: JSON.stringify({ enemyId, enemyHp: 10, status: 'active' }),
    message: 'incompleto'
  }
]) {
  test(`QA preserva la batalla con ${scenario.name} y bloquea sus acciones`, async ({ page }) => {
    await seedStorage(page, {
      session: {
        [POINTER_KEY]: pointer(enemyId, encounterId),
        [battleKey]: scenario.stored
      }
    });
    await page.goto(`/combate-qa.html?enemy=${enemyId}`);

    await expect(page.locator('#waiting')).toBeVisible();
    await expect(page.locator('#waiting-message')).toContainText(scenario.message);
    await expect(page.locator('#roll')).toBeDisabled();
    await expect(page.locator('#enemy-select')).toBeDisabled();
    expect(await page.evaluate(key => sessionStorage.getItem(key), battleKey)).toBe(scenario.stored);
  });
}

test('QA muestra el error y conserva la clave si getItem falla', async ({ page }) => {
  const validRaw = JSON.stringify({
    enemyId,
    enemyHp: 10,
    status: 'active',
    round: 0,
    encounterId
  });
  await seedStorage(page, {
    session: {
      [POINTER_KEY]: pointer(enemyId, encounterId),
      [battleKey]: validRaw
    }
  });
  await page.addInitScript(key => {
    const originalGetItem = Storage.prototype.getItem;
    window.__readBattleForTest = () => originalGetItem.call(sessionStorage, key);
    Storage.prototype.getItem = function (requestedKey) {
      if (this === sessionStorage && requestedKey === key) throw new Error('test storage read failure');
      return originalGetItem.call(this, requestedKey);
    };
  }, battleKey);

  await page.goto(`/combate-qa.html?enemy=${enemyId}`);

  await expect(page.locator('#waiting-message')).toContainText('No se pudo leer');
  await expect(page.locator('#roll')).toBeDisabled();
  expect(await page.evaluate(() => window.__readBattleForTest())).toBe(validRaw);
});
