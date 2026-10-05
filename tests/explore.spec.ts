import { test, expect } from '@playwright/test';

const adrianaProfile = '/deputado/204528/';

async function expectNoPageOverflow(page: import('@playwright/test').Page, label: string) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, page: document.documentElement.scrollWidth }));
  expect(dimensions.page, `${label}: ${dimensions.page}px content at ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('official search ignores accents, exposes an empty state, and resets filters', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Ver perfil de Adriana Ventura' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Buscar por nome ou partido' });

  await search.fill('Luíza');
  await expect(page.locator('[data-deputy-card]:visible')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Luiza Erundina' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Luíza');

  await search.fill('samia');
  await expect(page.getByRole('heading', { name: 'Sâmia Bomfim' })).toBeVisible();
  await search.fill('nome sem correspondência 12345');
  await expect(page.getByText('Nenhum perfil encontrado')).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue('nome sem correspondência 12345');
  await page.locator('.empty-results').getByRole('button', { name: 'Limpar filtros' }).click();
  expect(await page.locator('[data-deputy-card]:visible').count()).toBeGreaterThan(1);
  await expect(search).toBeFocused();
  expect(new URL(page.url()).search).toBe('');
});

test('profile period, tabs, keyboard, hash, history, and return link stay in sync', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${adrianaProfile}?q=Adriana&period=month#%E0%A4%A`);
  const overview = page.getByRole('tab', { name: 'Visão geral' });
  const votes = page.getByRole('tab', { name: 'Votos' });
  const expenses = page.getByRole('tab', { name: 'Despesas' });
  const period = page.getByLabel('Período dos dados');
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await expect(period).toHaveValue('month');
  await overview.focus();
  await page.keyboard.press('ArrowRight');
  await expect(votes).toBeFocused();
  await expect(votes).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#profile-panel-votos')).toBeVisible();
  await votes.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Emendas' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(overview).toBeFocused();

  await expenses.click();
  await period.selectOption('quarter');
  expect(new URL(page.url()).searchParams.get('period')).toBe('quarter');
  expect(new URL(page.url()).hash).toBe('#despesas');
  await page.reload();
  await expect(expenses).toHaveAttribute('aria-selected', 'true');
  await expect(period).toHaveValue('quarter');
  await expect(page.locator('#profile-panel-despesas')).toBeVisible();
  await page.getByRole('link', { name: 'Explorar', exact: true }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('Adriana');
  await expect(page.getByLabel('Período dos dados')).toHaveValue('quarter');
  await expect(page.locator('[data-deputy-card]:visible')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test('official profile separates nominal votes, coauthored proposals, and unavailable amendments', async ({ page }) => {
  await page.goto(adrianaProfile);
  await expect(page.getByRole('heading', { name: 'Adriana Ventura', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registro oficial do perfil' }).first()).toHaveAttribute('href', /^https:\/\//);
  await expect(page.locator('.profile-summary-card').first()).toContainText('Votos nominais');
  await expect(page.locator('.profile-summary-card').nth(2)).toContainText('autoria ou coautoria');

  await page.getByRole('tab', { name: 'Votos' }).click();
  const votesPanel = page.locator('#profile-panel-votos');
  await expect(votesPanel).toContainText('Plenário e comissões');
  await expect(votesPanel).toContainText('não mede presença');
  await expect(votesPanel.getByRole('link', { name: 'Consultar a fonte de votações' })).toHaveAttribute('href', /^https:\/\//);

  await page.getByRole('tab', { name: 'Emendas' }).click();
  const amendmentsPanel = page.locator('#profile-panel-emendas');
  await expect(amendmentsPanel).toContainText('Ainda não disponível');
  await expect(amendmentsPanel.locator('.profile-stage-card:visible')).toHaveCount(0);
  await expect(amendmentsPanel.locator('.profile-amendment-card:visible')).toHaveCount(0);
});

test('theme follows the system and preserves a manual choice across navigation', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Ativar tema claro' }).click();
  await page.goto(adrianaProfile);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('home and all profile sections fit narrow screens', async ({ page }) => {
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expectNoPageOverflow(page, `home ${width}px`);
    await page.goto(adrianaProfile);
    await expect(page.locator('main')).toHaveCount(1);
    for (const tab of ['Visão geral', 'Votos', 'Despesas', 'Emendas']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expectNoPageOverflow(page, `${tab} ${width}px`);
    }
  }
});

test('default-period profile remains readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4174${adrianaProfile}`);
  await expect(page.getByRole('heading', { name: 'Adriana Ventura', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Votos nominais' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Emendas parlamentares' })).toBeVisible();
  await expect(page.locator('#profile-panel-emendas')).toContainText('Ainda não disponível');
  await context.close();
});
