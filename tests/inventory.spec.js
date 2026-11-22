const { test, expect } = require('@playwright/test');
const { INVENTORY_KEY, seedStorage } = require('./support');

test('el inventario DM permite duplicados hasta 15 y bloquea la unidad 16', async ({ page }) => {
  await seedStorage(page, {
    local: {
      [INVENTORY_KEY]: Array(14).fill('cumbia')
    }
  });
  await page.goto('/dm-inventario.html');

  await page.locator('#dm-item').selectOption('cumbia');
  await expect(page.locator('#dm-inventory-save')).toBeEnabled();
  await page.locator('#dm-inventory-save').click();
  await expect(page.locator('#dm-inventory-save')).toHaveText('Inventario lleno');
  await expect(page.locator('#dm-inventory-save')).toBeDisabled();

  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY))
    .toEqual(Array(15).fill('cumbia'));
});

test('Neo no puede retirar objetos y los cambios de Cherry persisten tras recargar', async ({ page, context }) => {
  await seedStorage(page, {
    local: {
      [INVENTORY_KEY]: ['cumbia', 'cumbia']
    }
  });
  await page.goto('/inventario.html');

  await page.getByRole('button', { name: 'Poción de la cumbia, espacio 1' }).click();
  await expect(page.locator('#item-delete')).toBeHidden();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY))
    .toEqual(['cumbia', 'cumbia']);

  const dmPage = await context.newPage();
  await dmPage.goto('/dm-inventario.html');
  await dmPage.locator('#dm-remove-slot').selectOption('0');
  await dmPage.locator('#dm-inventory-remove').click();
  await expect(dmPage.locator('#dm-inventory-status')).toContainText('retirado');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Poción de la cumbia, espacio 1' })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), INVENTORY_KEY))
    .toEqual(['cumbia']);
});
