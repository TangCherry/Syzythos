const { test, expect } = require('@playwright/test');

test('diagnóstico muestra el rol y las estadísticas remotas de neo_main', async ({ page }) => {
  await page.goto('/diagnostico.html?__mock_role=dm');

  await expect(page.locator('#diagnostic-status')).toContainText('Lectura remota correcta para el rol dm');
  await expect(page.locator('#diagnostic-game')).toHaveText('neo_main');
  await expect(page.locator('#diagnostic-hp')).toHaveText('28');
  await expect(page.locator('#diagnostic-max-hp')).toHaveText('28');
  await expect(page.locator('#diagnostic-atk')).toHaveText('35');
  await expect(page.locator('#diagnostic-xp')).toHaveText('9750');
  await expect(page.locator('#diagnostic-weapon')).toHaveText('Gancho');
});

test('diagnóstico permite comprobar también la lectura con rol player', async ({ page }) => {
  await page.goto('/diagnostico.html?__mock_role=player');

  await expect(page.locator('#diagnostic-status')).toContainText('Lectura remota correcta para el rol player');
  await expect(page.locator('#diagnostic-xp')).toHaveText('9750');
});
