(() => {
  'use strict';

  const FMF = window.FMF;
  const $ = (id) => document.getElementById(id);
  const form = $('form');
  let settings = FMF.normalizeSettings();

  function buildChips(container, name, values, labels) {
    for (const value of values) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name;
      input.value = value;
      const span = document.createElement('span');
      span.textContent = labels[value];
      label.append(input, span);
      container.append(label);
    }
  }

  buildChips($('fuels'), 'fuels', FMF.FUELS, FMF.FUEL_LABELS);
  buildChips($('transmissions'), 'transmissions', FMF.TRANSMISSIONS, FMF.TRANSMISSION_LABELS);

  const thisYear = FMF.maxYear() - 1;
  $('yearMin').max = $('yearMax').max = String(thisYear + 1);
  $('yearMin').placeholder = 'od, np. 2010';
  $('yearMax').placeholder = 'do, np. ' + thisYear;

  function fill() {
    $('enabled').checked = settings.enabled;
    $('yearMin').value = settings.yearMin ?? '';
    $('yearMax').value = settings.yearMax ?? '';
    $('mileageMax').value = settings.mileageMax ?? '';
    for (const input of form.querySelectorAll('input[name="fuels"]')) input.checked = settings.fuels.includes(input.value);
    for (const input of form.querySelectorAll('input[name="transmissions"]')) {
      input.checked = settings.transmissions.includes(input.value);
    }
    form.querySelector(`input[name="unknownMode"][value="${settings.unknownMode}"]`).checked = true;
    form.querySelector(`input[name="rejectMode"][value="${settings.rejectMode}"]`).checked = true;
    $('fetchDetails').checked = settings.fetchDetails;
    $('showBadges').checked = settings.showBadges;
    $('debugLog').checked = settings.debugLog;
    updateWarnings();
  }

  function readForm() {
    const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    return FMF.normalizeSettings({
      enabled: $('enabled').checked,
      yearMin: $('yearMin').value,
      yearMax: $('yearMax').value,
      mileageMax: $('mileageMax').value,
      fuels: checked('fuels'),
      transmissions: checked('transmissions'),
      unknownMode: checked('unknownMode')[0],
      rejectMode: checked('rejectMode')[0],
      fetchDetails: $('fetchDetails').checked,
      showBadges: $('showBadges').checked,
      debugLog: $('debugLog').checked,
    });
  }

  function updateWarnings() {
    const s = readForm();
    $('yearWarn').hidden = !(s.yearMin && s.yearMax && s.yearMin > s.yearMax);
    form.classList.toggle('disabled', !s.enabled);
  }

  function save() {
    settings = readForm();
    updateWarnings();
    chrome.storage.sync.set({ settings });
  }

  let typingTimer = null;
  form.addEventListener('input', (e) => {
    if (e.target.type === 'number') {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(save, 400);
      updateWarnings();
    }
  });
  form.addEventListener('change', save);
  $('enabled').addEventListener('change', save);

  $('reset').addEventListener('click', () => {
    settings = FMF.normalizeSettings({ enabled: settings.enabled });
    fill();
    chrome.storage.sync.set({ settings });
  });

  $('clearCache').addEventListener('click', async () => {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith('d:'));
    await chrome.storage.local.remove(keys);
    await chrome.storage.local.set({ cacheClearedAt: Date.now() });
    refreshCacheCount();
  });

  async function refreshCacheCount() {
    const all = await chrome.storage.local.get(null);
    const count = Object.keys(all).filter((k) => k.startsWith('d:')).length;
    $('cacheCount').textContent = count ? `(${count})` : '';
  }

  async function refreshStats() {
    const box = $('stats');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const s = await chrome.tabs.sendMessage(tab.id, { type: 'fmf:stats' });
      if (!s || !s.active) {
        box.textContent = 'Otwórz wyniki wyszukiwania na Facebook Marketplace, aby filtrować ogłoszenia.';
        return;
      }
      const parts = [`<b>${s.shown}</b> pasuje`, `<b>${s.hidden}</b> odfiltrowanych`];
      if (s.pending) parts.push(`<b>${s.pending}</b> sprawdzam`);
      if (s.unknown) parts.push(`<b>${s.unknown}</b> bez danych`);
      box.innerHTML = 'Na tej stronie: ' + parts.join(' · ') + (s.note ? `<br>${escapeHtml(s.note)}` : '');
    } catch (e) {
      box.textContent = 'Otwórz Facebook Marketplace (lub odśwież kartę), aby filtrować ogłoszenia.';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  }

  $('copyLog').addEventListener('click', async () => {
    const button = $('copyLog');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const records = await chrome.tabs.sendMessage(tab.id, { type: 'fmf:diagnostics' });
      if (!records || !records.length) {
        button.textContent = 'Brak logu na tej karcie';
      } else {
        await navigator.clipboard.writeText(FMF.diagnosticsText(records));
        button.textContent = `Skopiowano (${records.length})`;
      }
    } catch (e) {
      button.textContent = 'Nie udało się pobrać logu';
    }
    setTimeout(() => (button.textContent = 'Kopiuj log diagnostyczny'), 2500);
  });

  chrome.storage.sync.get('settings').then(({ settings: stored }) => {
    settings = FMF.normalizeSettings(stored);
    fill();
  });
  refreshCacheCount();
  refreshStats();
  setInterval(refreshStats, 1000);
})();
