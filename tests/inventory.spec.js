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

test('Cherry conserva la selección de retiro si el inventario no cambia y la invalida si cambia', async ({ page }) => {
  await seedStorage(page, {
    local: {
      [INVENTORY_KEY]: ['cumbia', 'bola']
    }
  });
  await page.goto('/dm-inventario.html?__mock_role=dm');

  const removeSlot = page.locator('#dm-remove-slot');
  const removeButton = page.locator('#dm-inventory-remove');
  await expect(removeSlot.locator('option')).toHaveCount(3);
  await removeSlot.selectOption('1');
  await page.locator('#dm-message').fill('Mensaje de prueba');
  await expect(removeSlot).toHaveValue('1');
  await expect(removeButton).toBeEnabled();

  await page.evaluate(() => {
    const adapter = window.MUSCULES_SUPABASE_TEST_ADAPTER;
    const data = adapter.getGameData();
    data.revision++;
    data.inventory = ['bola'];
    adapter.setGameData(data);
    window.dispatchEvent(new Event('focus'));
  });

  await expect.poll(() => page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_ADAPTER.getGameData().inventory
  )).toEqual(['bola']);
  await expect(removeSlot).toHaveValue('');
  await expect(removeButton).toBeDisabled();
  expect(await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.filter(query => query.rpc === 'dm_remove_item').length
  )).toBe(0);
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
