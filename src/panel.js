/*
 * Filter panel injected into the Marketplace page: docked in Facebook's left
 * sidebar (under its own "Filters" section) or, when there is no sidebar,
 * shown as a floating card. Rendered in a shadow root so Facebook's CSS does
 * not leak in; colours come from Facebook's CSS variables (light/dark theme).
 */
(() => {
  'use strict';

  const FMF = globalThis.FMF;
  if (!FMF || FMF.createPanel) return;

  const STYLE = `
    :host { all: initial; display: block; color: var(--primary-text, #050505);
      font-family: var(--font-family-default, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif); font-size: 15px; }
    :host([hidden]) { display: none; }
    * { box-sizing: border-box; }
    .panel { margin: 8px 8px 4px; padding: 4px 8px 8px; border-top: 1px solid var(--divider, #ced0d4); }
    :host(.floating) .panel { margin: 0; padding: 4px 12px 12px; border: 0; border-radius: 12px;
      width: 320px; max-height: calc(100vh - 120px); overflow: auto;
      background: var(--card-background, #fff); box-shadow: 0 12px 28px rgba(0,0,0,.2), 0 2px 4px rgba(0,0,0,.1); }
    header { display: flex; align-items: center; gap: 8px; padding: 10px 0 6px; }
    .toggle-open { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; padding: 0; border: 0;
      background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    h2 { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.2; }
    .chev { margin-left: auto; width: 20px; text-align: center; color: var(--secondary-text, #65676b); transition: transform .15s; }
    .collapsed .chev { transform: rotate(-90deg); }
    .collapsed .body { display: none; }
    .stats { margin: 0 0 6px; font-size: 13px; line-height: 1.35; color: var(--secondary-text, #65676b); }
    .stats b { color: var(--primary-text, #050505); font-weight: 600; }
    .off .body > :not(.always) { opacity: .45; pointer-events: none; }
    .field { padding: 8px 0; }
    .label { margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--secondary-text, #65676b); }
    .row { display: flex; align-items: center; gap: 8px; }
    .row span { color: var(--secondary-text, #65676b); font-size: 14px; }
    input[type=number] { width: 100%; min-width: 0; height: 36px; padding: 0 12px; border-radius: 6px; font: inherit; font-size: 15px;
      color: var(--primary-text, #050505); background: var(--comment-background, #f0f2f5); border: 1px solid transparent; outline: none;
      -moz-appearance: textfield; }
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number]:focus { border-color: var(--accent, #0866ff); }
    input[type=number]::placeholder { color: var(--secondary-text, #65676b); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { height: 32px; padding: 0 12px; border-radius: 16px; border: 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600;
      color: var(--primary-text, #050505); background: var(--secondary-button-background, #e4e6eb); }
    .chip:hover { filter: brightness(1.08); }
    .chip[aria-pressed=true] { color: #fff; background: var(--accent, #0866ff); }
    .seg { display: flex; padding: 2px; border-radius: 8px; background: var(--comment-background, #f0f2f5); }
    .seg button { flex: 1; height: 30px; border: 0; border-radius: 6px; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
      color: var(--secondary-text, #65676b); background: none; }
    .seg button[aria-pressed=true] { color: #fff; background: var(--accent, #0866ff); }
    .check { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; font-size: 14px; cursor: pointer; }
    .check input { margin: 2px 0 0; accent-color: var(--accent, #0866ff); }
    .check small { display: block; color: var(--secondary-text, #65676b); font-size: 12px; }
    .hint, .warn { margin: 4px 0 0; font-size: 12px; color: var(--secondary-text, #65676b); }
    .warn { color: #e41e3f; }
    .switch { position: relative; flex: none; width: 40px; height: 22px; border: 0; padding: 0; border-radius: 11px; cursor: pointer;
      background: var(--divider, #ced0d4); transition: background .15s; }
    .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .switch[aria-checked=true] { background: var(--accent, #0866ff); }
    .switch[aria-checked=true]::after { transform: translateX(18px); }
    footer { display: flex; gap: 8px; padding-top: 10px; }
    footer button { flex: 1; height: 36px; border: 0; border-radius: 6px; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600;
      color: var(--primary-text, #050505); background: var(--secondary-button-background, #e4e6eb); }
    footer button:hover, .chip:hover { filter: brightness(1.08); }
    .wide { width: 100%; height: 32px; margin-top: 6px; border: 0; border-radius: 6px; cursor: pointer; font: inherit;
      font-size: 13px; font-weight: 600; color: var(--primary-text, #050505); background: var(--secondary-button-background, #e4e6eb); }
    .log { max-height: 260px; overflow: auto; margin-top: 8px; padding: 8px; border-radius: 8px;
      background: var(--comment-background, #f0f2f5); font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .log[hidden] { display: none; }
    .log div + div { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--divider, #ced0d4); }
    .log b, .log span { display: block; }
    .log b { font-weight: 700; }
    .log .v-reject { color: #e41e3f; font-weight: 700; }
    .log .v-match { color: #1e8449; font-weight: 700; }
    .log .v-unknown { color: var(--secondary-text, #65676b); font-weight: 700; }
    .log .muted { color: var(--secondary-text, #65676b); }
    .close { display: none; flex: none; width: 28px; height: 28px; border: 0; border-radius: 50%; cursor: pointer; font-size: 16px;
      color: var(--secondary-text, #65676b); background: var(--secondary-button-background, #e4e6eb); }
    :host(.floating) .close { display: block; }
    :host(.floating) .chev { display: none; }
    :host(.flash) .panel { animation: flash 1s ease; }
    @keyframes flash { 0%, 60% { background: var(--hover-overlay, rgba(0,0,0,.05)); } 100% { background: none; } }
  `;

  const TEMPLATE = `
    <div class="panel">
      <header>
        <button type="button" class="toggle-open" aria-expanded="true">
          <h2>Filtr aut</h2><span class="chev" aria-hidden="true">▾</span>
        </button>
        <button type="button" class="switch" role="switch" aria-checked="true" title="Włącz / wyłącz filtrowanie"></button>
        <button type="button" class="close" title="Zamknij">✕</button>
      </header>
      <p class="stats"></p>
      <div class="body">
        <div class="field">
          <div class="label">Rok produkcji</div>
          <div class="row"><input type="number" name="yearMin" min="1930" inputmode="numeric" placeholder="od"><span>–</span>
            <input type="number" name="yearMax" min="1930" inputmode="numeric" placeholder="do"></div>
          <p class="warn" data-warn="year" hidden>„Od” jest większe niż „do”.</p>
        </div>
        <div class="field"><div class="label">Paliwo</div><div class="chips" data-chips="fuels"></div></div>
        <div class="field"><div class="label">Skrzynia biegów</div><div class="chips" data-chips="transmissions"></div></div>
        <div class="field">
          <div class="label">Przebieg</div>
          <div class="row"><span>do</span><input type="number" name="mileageMax" min="0" step="10000" inputmode="numeric" placeholder="dowolny"><span>km</span></div>
          <p class="hint">Niezaznaczone paliwo / skrzynia = dowolne.</p>
        </div>
        <div class="field">
          <div class="label">Ogłoszenia bez tych danych</div>
          <div class="seg" data-seg="unknownMode"><button type="button" value="show">Pokazuj z „?”</button><button type="button" value="hide">Ukrywaj</button></div>
        </div>
        <div class="field">
          <div class="label">Niepasujące ogłoszenia</div>
          <div class="seg" data-seg="rejectMode"><button type="button" value="hide">Ukrywaj</button><button type="button" value="dim">Przyciemniaj</button></div>
        </div>
        <label class="check"><input type="checkbox" name="fetchDetails"><span>Sprawdzaj opisy ogłoszeń
          <small>Paliwa i skrzyni zwykle nie widać na liście.</small></span></label>
        <label class="check"><input type="checkbox" name="showBadges"><span>Pokazuj etykiety na ogłoszeniach</span></label>
        <div class="field">
          <div class="label">Diagnostyka</div>
          <label class="check"><input type="checkbox" name="debugLog"><span>Loguj do konsoli
            <small>Co pokazuje Facebook, co wyciągnął parser i jaki wyszedł werdykt.</small></span></label>
          <button type="button" class="wide" data-action="toggleLog">Pokaż log ogłoszeń (<span data-log-count>0</span>)</button>
          <div class="log" data-log hidden></div>
          <button type="button" class="wide" data-action="copyLog">Kopiuj log do schowka</button>
        </div>
        <footer class="always">
          <button type="button" data-action="reset">Resetuj filtry</button>
          <button type="button" data-action="clearCache">Wyczyść pamięć</button>
        </footer>
      </div>
    </div>`;

  /**
   * @param {{ save(settings): void, clearCache(): void, onClose?(): void }} hooks
   * @returns {{ host: HTMLElement, setSettings(s): void, setStats(s): void, setCollapsed(b): void }}
   */
  function createPanel(hooks) {
    const host = document.createElement('div');
    host.id = 'fmf-panel';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
    const $ = (sel) => shadow.querySelector(sel);
    const panel = $('.panel');
    let settings = FMF.normalizeSettings();

    // Keep Facebook's global keyboard shortcuts away from our inputs.
    for (const type of ['keydown', 'keyup', 'keypress']) panel.addEventListener(type, (e) => e.stopPropagation());

    function buildChips(name, values, labels) {
      const box = $(`[data-chips="${name}"]`);
      for (const value of values) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.value = value;
        b.textContent = labels[value];
        b.setAttribute('aria-pressed', 'false');
        box.append(b);
      }
    }
    buildChips('fuels', FMF.FUELS, FMF.FUEL_LABELS);
    buildChips('transmissions', FMF.TRANSMISSIONS, FMF.TRANSMISSION_LABELS);
    $('[name=yearMax]').placeholder = 'do, np. ' + (FMF.maxYear() - 1);
    $('[name=yearMin]').placeholder = 'od, np. 2010';

    function update(patch) {
      settings = FMF.normalizeSettings(Object.assign({}, settings, patch));
      render();
      hooks.save(settings);
    }

    function render() {
      panel.classList.toggle('off', !settings.enabled);
      $('.switch').setAttribute('aria-checked', String(settings.enabled));
      for (const name of ['yearMin', 'yearMax', 'mileageMax']) {
        const input = $(`[name=${name}]`);
        // Don't clobber what the user is typing.
        if (shadow.activeElement !== input) input.value = settings[name] ?? '';
      }
      for (const name of ['fuels', 'transmissions']) {
        for (const b of shadow.querySelectorAll(`[data-chips="${name}"] .chip`)) {
          b.setAttribute('aria-pressed', String(settings[name].includes(b.value)));
        }
      }
      for (const name of ['unknownMode', 'rejectMode']) {
        for (const b of shadow.querySelectorAll(`[data-seg="${name}"] button`)) b.setAttribute('aria-pressed', String(settings[name] === b.value));
      }
      $('[name=fetchDetails]').checked = settings.fetchDetails;
      $('[name=showBadges]').checked = settings.showBadges;
      $('[name=debugLog]').checked = settings.debugLog;
      updateWarning();
    }

    function updateWarning() {
      const min = parseInt($('[name=yearMin]').value, 10);
      const max = parseInt($('[name=yearMax]').value, 10);
      $('[data-warn=year]').hidden = !(min && max && min > max);
    }

    let typingTimer = null;
    for (const input of shadow.querySelectorAll('input[type=number]')) {
      const commit = () => {
        clearTimeout(typingTimer);
        if (String(settings[input.name] ?? '') !== input.value) update({ [input.name]: input.value });
      };
      input.addEventListener('input', () => {
        updateWarning();
        clearTimeout(typingTimer);
        typingTimer = setTimeout(commit, 600);
      });
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
      });
    }

    shadow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) {
        const name = chip.parentElement.dataset.chips;
        const list = settings[name].includes(chip.value) ? settings[name].filter((v) => v !== chip.value) : settings[name].concat(chip.value);
        update({ [name]: list });
        return;
      }
      const seg = e.target.closest('.seg button');
      if (seg) return update({ [seg.parentElement.dataset.seg]: seg.value });
      if (e.target.closest('.switch')) return update({ enabled: !settings.enabled });
      if (e.target.closest('.toggle-open')) return setCollapsed(!panel.classList.contains('collapsed'), true);
      if (e.target.closest('.close')) return hooks.onClose && hooks.onClose();
      const action = e.target.closest('[data-action]');
      if (action && action.dataset.action === 'reset') {
        update(FMF.normalizeSettings({ enabled: settings.enabled, unknownMode: settings.unknownMode, rejectMode: settings.rejectMode,
          fetchDetails: settings.fetchDetails, showBadges: settings.showBadges }));
      } else if (action && action.dataset.action === 'clearCache') {
        hooks.clearCache();
      } else if (action && action.dataset.action === 'toggleLog') {
        logOpen = !logOpen;
        logBox.hidden = !logOpen;
        renderLog();
      } else if (action && action.dataset.action === 'copyLog') {
        copyLog();
      }
    });

    for (const name of ['fetchDetails', 'showBadges', 'debugLog']) {
      $(`[name=${name}]`).addEventListener('change', (e) => update({ [name]: e.target.checked }));
    }

    // --- diagnostics log -----------------------------------------------------
    const logBox = $('[data-log]');
    let logOpen = false;

    function renderLog() {
      const records = hooks.getDiagnostics ? hooks.getDiagnostics() : [];
      $('[data-log-count]').textContent = String(records.length);
      if (!logOpen) return;
      if (!records.length) {
        logBox.textContent = 'Brak sprawdzonych ogłoszeń.';
        return;
      }
      logBox.replaceChildren(
        ...records.map((rec) => {
          const box = document.createElement('div');
          const title = document.createElement('b');
          title.textContent = rec.title;
          const fb = document.createElement('span');
          fb.className = 'muted';
          fb.textContent = 'FB: ' + FMF.fbSummary(rec);
          const parsed = document.createElement('span');
          parsed.className = 'muted';
          parsed.textContent = 'Rozszerzenie: ' + FMF.parsedSummary(rec);
          const verdict = document.createElement('span');
          verdict.className = 'v-' + (rec.state === 'match' ? 'match' : rec.state === 'reject' || rec.state === 'reject-unknown' ? 'reject' : 'unknown');
          verdict.textContent = FMF.verdictText(rec);
          box.append(title, fb, parsed, verdict);
          return box;
        })
      );
    }

    async function copyLog() {
      const text = hooks.getDiagnosticsText ? hooks.getDiagnosticsText() : '';
      const button = $('[data-action=copyLog]');
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Skopiowano ✓';
      } catch (e) {
        button.textContent = 'Nie udało się skopiować';
      }
      setTimeout(() => (button.textContent = 'Kopiuj log do schowka'), 2000);
    }

    function setCollapsed(collapsed, save) {
      panel.classList.toggle('collapsed', collapsed);
      $('.toggle-open').setAttribute('aria-expanded', String(!collapsed));
      if (save && hooks.saveCollapsed) hooks.saveCollapsed(collapsed);
    }

    function setStats(s) {
      const box = $('.stats');
      let html;
      if (!s.enabled) html = 'Filtr wyłączony.';
      else if (!s.hasFilters) html = 'Ustaw filtry poniżej.';
      else {
        const parts = [`<b>${s.shown}</b> pasuje`, `<b>${s.hidden}</b> odfiltrowanych`];
        if (s.pending) parts.push(`<b>${s.pending}</b> sprawdzam`);
        if (s.unknown) parts.push(`<b>${s.unknown}</b> bez danych`);
        html = parts.join(' · ');
      }
      if (s.note) html += '<br>' + escapeHtml(s.note);
      if (box.innerHTML !== html) box.innerHTML = html;
    }

    render();
    return {
      host,
      setSettings(s) {
        settings = FMF.normalizeSettings(s);
        render();
      },
      setStats,
      setCollapsed: (c) => setCollapsed(c, false),
      refreshLog: renderLog,
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  FMF.createPanel = createPanel;
})();
