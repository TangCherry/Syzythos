const { test, expect } = require('@playwright/test');

const pages = [
  '/index.html',
  '/perfil.html',
  '/inventario.html',
  '/combate.html',
  '/combate-qa.html',
  '/dm.html',
  '/dm-perfil.html',
  '/dm-inventario.html',
  '/dm-encuentro.html'
];

test('las páginas principales cargan sin errores JavaScript', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  for (const route of pages) {
    await page.goto(route);
    await expect(page.locator('body')).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
});
