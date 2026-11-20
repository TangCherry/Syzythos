const { test, expect } = require('@playwright/test');
const { STATS_KEY, seedStorage, stats } = require('./support');

test('un cambio de perfil DM se refleja en Neo desde otra pestaña', async ({ page, context }) => {
  await seedStorage(page, {
    local: {
      [STATS_KEY]: stats()
    }
  });
  await page.goto('/perfil.html');
  const dmPage = await context.newPage();
  await dmPage.goto('/dm-perfil.html');

  await dmPage.locator('.dm-profile-edit').click();
  await dmPage.locator('#dm-atk').fill('42');
  await dmPage.locator('#dm-profile-save').click();
  await expect(dmPage.locator('#dm-profile-status')).toHaveText('Cambios guardados correctamente.');
  await expect(page.locator('#atk-value')).toHaveText('42');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).atk, STATS_KEY)).toBe(42);
});
