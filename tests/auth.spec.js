const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');

test('una sesión simulada permite entrar y cerrar sesión sin usar credenciales reales', async ({ page }) => {
  await page.goto('/login.html?__mock_role=player');
  await page.locator('#login-email').fill(`test-${randomUUID()}@example.invalid`);
  await page.locator('#login-password').fill(randomUUID());
  await page.locator('#login-submit').click();

  await expect(page).toHaveURL(/\/index\.html$/);
  const roleQuery = await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.find(query => query.table === 'game_members')
  );
  expect(roleQuery).toMatchObject({
    table: 'game_members',
    selectedColumns: 'role',
    userId: roleQuery.sessionUserId
  });
  await page.goto('/login.html');
  await expect(page.locator('#active-session')).toBeVisible();
  await page.locator('#logout-button').click();
  await expect(page.locator('#login-form')).toBeVisible();
});

test('un usuario DM que llega con next=index.html va a dm.html', async ({ page }) => {
  await page.goto('/login.html?next=%2Findex.html&__mock_role=dm');
  await page.locator('#login-email').fill(`test-${randomUUID()}@example.invalid`);
  await page.locator('#login-password').fill(randomUUID());
  await page.locator('#login-submit').click();

  await expect(page).toHaveURL(/\/dm\.html$/);
  const roleQuery = await page.evaluate(() =>
    window.MUSCULES_SUPABASE_TEST_QUERIES.find(query => query.table === 'game_members')
  );
  expect(roleQuery).toMatchObject({
    table: 'game_members',
    selectedColumns: 'role',
    userId: roleQuery.sessionUserId
  });
});

test('si no se puede consultar el rol, el login muestra un error y no asume player', async ({ page }) => {
  await page.goto('/login.html?__mock_role=dm&__mock_role_lookup_fail=1');
  await page.locator('#login-email').fill(`test-${randomUUID()}@example.invalid`);
  await page.locator('#login-password').fill(randomUUID());
  await page.locator('#login-submit').click();

  await expect(page).toHaveURL(/\/login\.html\?/);
  await expect(page.locator('#login-status')).toContainText('Error simulado al consultar game_members');
  await expect(page.locator('#login-form')).toBeVisible();
});

test('una página del jugador redirige al inicio de sesión si no hay sesión', async ({ page }) => {
  await page.goto('/perfil.html?__mock_no_session=1');

  await expect(page).toHaveURL(/\/login\.html\?next=/);
  await expect(page.locator('#login-form')).toBeVisible();
});

test('un usuario player no puede abrir una página DM', async ({ page }) => {
  await page.goto('/dm.html?__mock_role=player');

  await expect(page).toHaveURL(/\/login\.html\?next=.*reason=role/);
  await expect(page.locator('#login-status')).toContainText('no tiene permiso');
});

test('un usuario DM puede abrir el panel DM', async ({ page }) => {
  await page.goto('/dm.html?__mock_role=dm');

  await expect(page).toHaveURL(/\/dm\.html\?__mock_role=dm$/);
  await expect(page.locator('main')).toBeVisible();
});

test('combate-qa no carga configuración ni cliente de Supabase', async ({ page }) => {
  const supabaseRequests = [];
  page.on('request', request => {
    if (request.url().includes('supabase-config.js')
      || request.url().includes('supabase-js')) {
      supabaseRequests.push(request.url());
    }
  });
  await page.goto('/combate-qa.html');

  await expect(page.locator('body')).toHaveAttribute('data-muscules-storage', 'qa');
  expect(supabaseRequests).toEqual([]);
});

test('el login conserva su composición y controles en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/login.html');

  await expect(page.getByRole('heading', { name: 'Bienvenido, aventurero' })).toBeVisible();
  await expect(page.getByLabel('Correo')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar a la aventura' })).toBeVisible();
  await expect(page.locator('.login-star')).toHaveCount(4);
  await expect(page.locator('.login-swords')).toBeVisible();
  const metrics = await page.evaluate(() => ({
    buttonHeight: document.querySelector('#login-submit').getBoundingClientRect().height,
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    pageBackground: getComputedStyle(document.body).backgroundColor,
    frameColor: getComputedStyle(document.querySelector('.login-portal')).backgroundColor,
    background: getComputedStyle(document.querySelector('.login-portal'), '::before').backgroundImage,
    imageInset: getComputedStyle(document.querySelector('.login-portal'), '::before').inset
  }));
  expect(metrics.buttonHeight).toBeGreaterThanOrEqual(48);
  expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.background).toContain('login-fondo.jpeg');
  expect(metrics.imageInset).toBe('19px');
  expect(metrics.pageBackground).not.toBe(metrics.frameColor);
});

for (const { route, role, label } of [
  { route: '/index.html', role: 'player', label: 'Neo' },
  { route: '/dm.html', role: 'dm', label: 'Cherry' }
]) {
  test(`Cerrar sesión desde Home de ${label} preserva los datos del juego`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('muscules_neo_stats_v01', '{"xp":9750}');
      localStorage.setItem('muscules_neo_inventory_v01', '["cumbia"]');
      localStorage.setItem('muscules_dynamic_current_encounter_v01', '{"encounterId":"kept"}');
      sessionStorage.setItem('qa-test-state', 'kept');
    });
    await page.goto(`${route}?__mock_role=${role}`);

    const signOutButton = page.getByRole('button', { name: 'Cerrar sesión' });
    await expect(signOutButton).toBeVisible();
    await expect(signOutButton.locator('img')).toHaveAttribute('src', 'assets/exit.png');
    const signOutStyle = await signOutButton.evaluate(button => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        backgroundColor: style.backgroundColor,
        borderStyle: style.borderStyle,
        boxShadow: style.boxShadow
      };
    });
    expect(signOutStyle.width).toBeGreaterThanOrEqual(44);
    expect(signOutStyle.height).toBeGreaterThanOrEqual(44);
    expect(signOutStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(signOutStyle.borderStyle).toBe('none');
    expect(signOutStyle.boxShadow).toBe('none');
    await signOutButton.click();
    await expect(page).toHaveURL(/\/login\.html$/);
    await expect(page.locator('#login-form')).toBeVisible();

    const stored = await page.evaluate(() => ({
      stats: localStorage.getItem('muscules_neo_stats_v01'),
      inventory: localStorage.getItem('muscules_neo_inventory_v01'),
      encounter: localStorage.getItem('muscules_dynamic_current_encounter_v01'),
      qa: sessionStorage.getItem('qa-test-state')
    }));
    expect(stored).toEqual({
      stats: '{"xp":9750}',
      inventory: '["cumbia"]',
      encounter: '{"encounterId":"kept"}',
      qa: 'kept'
    });

    await page.goto('/perfil.html?__mock_no_session=1');
    await expect(page).toHaveURL(/\/login\.html\?next=/);
  });
}

test('si signOut falla, el mensaje aparece y permite reintentar', async ({ page }) => {
  await page.goto('/index.html?__mock_role=player&__mock_signout_fail_once=1');
  const button = page.getByRole('button', { name: 'Cerrar sesión' });
  await button.click();

  await expect(page.locator('#home-signout-error')).toContainText('Error simulado');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/login\.html$/);
});
