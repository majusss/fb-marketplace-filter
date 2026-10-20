'use strict';

/*
 * End-to-end test: loads the unpacked extension into Chromium and serves fake
 * Facebook Marketplace pages (structured like the real ones) through request
 * interception, so no network access or Facebook account is needed.
 *
 *   npm run test:e2e        (requires the `playwright` package)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  test('e2e (skipped: playwright not installed)', { skip: true }, () => {});
  return;
}

const EXT_PATH = path.resolve(__dirname, '..');
const SHOTS_DIR = process.env.FMF_SCREENSHOTS || null;

// Chrome derives an unpacked extension's id from its absolute path.
function extensionId(dir) {
  const hash = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32);
  return [...hash].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');
}

const LISTINGS = {
  1001: { card: ['25 900 zł', '2012 Volkswagen Passat', 'Warszawa', '187 tys. km'], fuel: 'DIESEL', trans: 'AUTOMATIC' },
  1002: { card: ['8 500 zł', '2008 Opel Astra', 'Łódź', '230 tys. km'], fuel: 'GASOLINE', trans: 'MANUAL' },
  1003: {
    card: ['32 000 zł', '2015 Škoda Octavia 1.6 TDI', 'Kraków', '160 tys. km'],
    desc: 'Auto zadbane, klimatyzacja automatyczna.\nSkrzynia biegów: manualna 5-biegowa.',
  },
  1004: {
    card: ['41 000 zł', 'Toyota Avensis', 'Poznań', '140 tys. km'],
    desc: 'Rok produkcji: 2014\nSilnik 2.0 D-4D, skrzynia automatyczna, bezwypadkowa.',
  },
  1005: { card: ['39 900 zł', '2016 Ford Mondeo', 'Gdańsk', '120 tys. km'], fuel: 'GASOLINE', trans: 'AUTOMATIC' },
  1006: { card: ['29 000 zł', '2013 Kia Cee\'d', 'Lublin', '150 tys. km'], desc: 'Sprzedam, stan dobry.' },
  1007: { card: ['89 000 zł', '2018 BMW 520d xDrive Steptronic', 'Wrocław', '98 tys. km'] },
  // Added later, like infinite scroll.
  1008: { card: ['35 000 zł', '2011 Audi A4 2.0 TDI', 'Opole', '210 tys. km'], fuel: 'DIESEL', trans: 'MANUAL' },
  1009: { card: ['55 000 zł', '2017 Mazda 6 2.2 Skyactiv-D automat', 'Rzeszów', '110 tys. km'] },
};

function escapeNonAscii(json) {
  return json.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function cardHtml(id) {
  const lines = LISTINGS[id].card.map((l) => `<div><span dir="auto"><span>${l}</span></span></div>`).join('');
  return `
    <div class="cell"><div><div><span><div>
      <a href="/marketplace/item/${id}/?ref=search&amp;referral_code=null" role="link" class="card-link">
        <div class="img"></div>
        <div class="text">${lines}</div>
      </a>
    </div></span></div></div></div>`;
}

// Facebook's left sidebar: a navigation landmark with the page heading (h1)
// and a "Filters" section (h2) followed by other sections.
const SIDEBAR = `
  <div role="navigation" aria-label="Pasek boczny Marketplace" style="width: 300px; min-height: 600px; flex: none; background: #fff">
    <div><h1>Pojazdy</h1>
      <div class="sections">
        <div><div><div><h2>Filtry</h2></div><div>Cena</div></div></div>
        <div class="fb-categories">Kategorie</div>
        <div>Inne</div>
      </div>
    </div>
  </div>`;

function searchPage(ids, { sidebar = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Marketplace</title>
    <style>
      body { font-family: sans-serif; margin: 0; background: #f0f2f5; }
      .layout { display: flex; }
      .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; }
      .cell { width: 210px; background: #fff; border-radius: 8px; padding: 8px; }
      .img { height: 130px; border-radius: 6px; background: linear-gradient(135deg, #b8c6db, #f5f7fa); margin-bottom: 6px; }
      a { color: inherit; text-decoration: none; }
    </style></head>
    <body><div class="layout">${sidebar ? SIDEBAR : ''}<div role="main"><h2 style="padding: 0 16px">Wyniki wyszukiwania: samochody</h2>
      <div class="grid" id="grid">${ids.map(cardHtml).join('')}</div></div></div>
      <script type="application/json" data-sjs>[["DTSGInitialData",[],{"token":"fake-dtsg"}],["LSD",[],{"token":"fake-lsd"}]]</script>
      <script>
        window.addMore = (html) => document.getElementById('grid').insertAdjacentHTML('beforeend', html);
      </script>
    </body></html>`;
}

// Response of the MarketplacePDPContainerQuery GraphQL query.
function itemGraphql(id) {
  const l = LISTINGS[id];
  const target = {
    __typename: 'GroupCommerceProductItem',
    id: String(id),
    marketplace_listing_title: l.card[1],
    redacted_description: { text: l.desc || '' },
    vehicle_fuel_type: l.fuel || null,
    vehicle_transmission_type: l.trans || null,
    vehicle_odometer_data: { unit: 'KILOMETERS', value: 150000 },
  };
  return escapeNonAscii(JSON.stringify({ data: { viewer: { marketplace_product_details_page: { target } } } }));
}

test('extension filters fake Marketplace listings', { timeout: 120000 }, async (t) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmf-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1000, height: 900 },
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  t.after(async () => {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  const fetched = [];
  await context.route('https://www.facebook.com/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/api/graphql/' && req.method() === 'POST') {
      const params = new URLSearchParams(req.postData() || '');
      assert.equal(params.get('fb_api_req_friendly_name'), 'MarketplacePDPContainerQuery');
      assert.equal(params.get('fb_dtsg'), 'fake-dtsg');
      const id = JSON.parse(params.get('variables')).targetId;
      fetched.push(id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: itemGraphql(id) });
    }
    if (url.pathname.startsWith('/marketplace/')) {
      const body = searchPage(['1001', '1002', '1003', '1004', '1005', '1006', '1007'], { sidebar: url.searchParams.has('sidebar') });
      return route.fulfill({ status: 200, contentType: 'text/html', body });
    }
    return route.fulfill({ status: 404, body: '' });
  });

  // --- Configure the filters through the popup UI -------------------------
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId(EXT_PATH)}/popup/popup.html`);
  await popup.fill('#yearMin', '2010');
  await popup.click('#fuels label:has-text("Diesel")');
  await popup.click('#transmissions label:has-text("Automat")');
  await popup.locator('#yearMin').blur();
  await popup.waitForTimeout(600);
  if (SHOTS_DIR) await popup.screenshot({ path: path.join(SHOTS_DIR, 'popup.png'), fullPage: true });
  const stored = await popup.evaluate(() => chrome.storage.sync.get('settings'));
  assert.deepEqual(
    { yearMin: stored.settings.yearMin, fuels: stored.settings.fuels, transmissions: stored.settings.transmissions },
    { yearMin: 2010, fuels: ['diesel'], transmissions: ['automatic'] }
  );

  // --- Search results --------------------------------------------------------
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/marketplace/warszawa/search?query=samochody');

  const stateOf = (id) =>
    page.evaluate((id) => {
      const a = document.querySelector(`a[href^="/marketplace/item/${id}/"]`);
      const cell = a && a.closest('.cell');
      return cell ? cell.dataset.fmfState || null : 'missing';
    }, id);
  const settle = async (ids) => {
    await page.waitForFunction(
      ({ ids }) =>
        ids.every((id) => {
          const cell = document.querySelector(`a[href^="/marketplace/item/${id}/"]`).closest('.cell');
          const s = cell.dataset.fmfState;
          return s && s !== 'pending';
        }),
      { ids },
      { timeout: 30000 }
    );
    return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await stateOf(id)])));
  };

  const first = await settle(['1001', '1002', '1003', '1004', '1005', '1006', '1007']);
  assert.deepEqual(first, {
    1001: 'match', // structured: diesel + automatic
    1002: 'hidden', // 2008 – rejected from the card alone
    1003: 'hidden', // description: manual gearbox
    1004: 'match', // year + fuel + gearbox only in the description
    1005: 'hidden', // structured: petrol
    1006: 'unknown', // nothing to go on – shown with "?"
    1007: 'match', // "520d ... Steptronic" in the title is enough
  });
  // The grid cell (not just the link) is what gets hidden.
  assert.equal(await page.locator('a[href^="/marketplace/item/1002/"]').isVisible(), false);
  assert.deepEqual([...fetched].sort(), ['1001', '1003', '1004', '1005', '1006']);

  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/marketplace/item/1004/"]')]
      .map((a) => [...a.closest('.cell').querySelectorAll('.fmf-chip')].map((c) => c.dataset.text))
      .flat()
  );
  assert.deepEqual(chips, ['2014', 'Diesel', 'Automat']);
  // Badge text must not leak into the card's own text.
  const cardText = await page.locator('a[href^="/marketplace/item/1004/"]').evaluate((a) => a.closest('.cell').innerText);
  assert.ok(!cardText.includes('Automat'), cardText);

  // The pill repaints on the next animation frame.
  await page.waitForFunction(() => /4 pasuje · 3 ukrytych · 1 bez danych/.test(document.getElementById('fmf-pill').textContent));
  if (SHOTS_DIR) await page.screenshot({ path: path.join(SHOTS_DIR, 'results.png') });

  // --- Infinite scroll ----------------------------------------------------------
  await page.evaluate((html) => window.addMore(html), cardHtml('1008') + cardHtml('1009'));
  const more = await settle(['1008', '1009']);
  assert.deepEqual(more, { 1008: 'hidden', 1009: 'match' });
  assert.ok(fetched.includes('1008') && !fetched.includes('1009'));

  // --- Changing options applies live ---------------------------------------
  await popup.click('input[name="unknownMode"][value="hide"] + span');
  await page.waitForFunction(() => document.querySelector('a[href^="/marketplace/item/1006/"]').closest('.cell').dataset.fmfState === 'hidden');

  await popup.click('input[name="rejectMode"][value="dim"] + span');
  await page.waitForFunction(() => document.querySelector('a[href^="/marketplace/item/1002/"]').closest('.cell').dataset.fmfState === 'dimmed');
  assert.equal(await page.locator('a[href^="/marketplace/item/1002/"]').isVisible(), true);
  if (SHOTS_DIR) await page.screenshot({ path: path.join(SHOTS_DIR, 'results-dimmed.png') });

  await popup.click('.switch span');
  await page.waitForFunction(() => !document.querySelector('[data-fmf-state]') && !document.querySelector('.fmf-badges'));
  await page.waitForFunction(() => /wyłączony/.test(document.getElementById('fmf-pill').textContent));

  // --- Clicking the pill turns it back on; a reload is served from the cache ---
  await page.click('#fmf-pill .fmf-pill-text');
  await page.waitForFunction(() => document.querySelector('[data-fmf-state="dimmed"]'));
  const fetchedBefore = fetched.length;
  await page.reload();
  const again = await settle(['1001', '1003', '1004', '1005', '1006']);
  assert.deepEqual(again, { 1001: 'match', 1003: 'dimmed', 1004: 'match', 1005: 'dimmed', 1006: 'dimmed' });
  assert.equal(fetched.length, fetchedBefore, 'details should come from the cache after a reload');

  // --- In-page panel: floating when there is no sidebar -----------------------
  assert.equal(await page.locator('#fmf-panel').isVisible(), false);
  await page.click('#fmf-pill .fmf-pill-gear');
  await page.locator('#fmf-panel').waitFor({ state: 'visible' });
  await page.click('#fmf-panel .seg[data-seg="rejectMode"] button[value="hide"]');
  await page.waitForFunction(() => document.querySelector('a[href^="/marketplace/item/1002/"]').closest('.cell').dataset.fmfState === 'hidden');
  await page.click('#fmf-panel .close');
  await page.locator('#fmf-panel').waitFor({ state: 'hidden' });

  // --- In-page panel: docked in Facebook's sidebar, under "Filters" -----------
  await page.goto('https://www.facebook.com/marketplace/category/vehicles?sidebar=1');
  await page.locator('#fmf-panel').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.getElementById('fmf-panel').nextElementSibling.className), 'fb-categories');
  assert.equal(await page.locator('#fmf-pill').isVisible(), false, 'the docked panel replaces the pill');
  await page.fill('#fmf-panel input[name="yearMin"]', '2016');
  await page.press('#fmf-panel input[name="yearMin"]', 'Enter');
  await page.click('#fmf-panel .chip:has-text("Automat")'); // deselect: any gearbox
  await page.waitForFunction(() => document.querySelector('a[href^="/marketplace/item/1001/"]').closest('.cell').dataset.fmfState === 'hidden');
  const fromPanel = await popup.evaluate(() => chrome.storage.sync.get('settings'));
  assert.deepEqual(
    { yearMin: fromPanel.settings.yearMin, transmissions: fromPanel.settings.transmissions },
    { yearMin: 2016, transmissions: [] }
  );
  assert.match(await page.locator('#fmf-panel .stats').innerText(), /pasuje/);
  if (SHOTS_DIR) await page.screenshot({ path: path.join(SHOTS_DIR, 'panel.png') });

  // --- Own listings / item pages are left alone ------------------------------
  await page.goto('https://www.facebook.com/marketplace/you/selling');
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-fmf-state]').length), 0);
  assert.equal(await page.locator('#fmf-pill').isVisible(), false);
});
