/*
 * Content script: finds listing cards on Facebook Marketplace, works out
 * year / fuel / transmission / mileage for each one (from the card, and if
 * needed from the listing page) and hides, dims or labels the cards.
 */
(() => {
  'use strict';

  const FMF = globalThis.FMF;
  if (!FMF || globalThis.__fmfContentLoaded) return;
  globalThis.__fmfContentLoaded = true;

  const ITEM_LINK = 'a[href*="/marketplace/item/"]';
  const CACHE_PREFIX = 'd:';
  const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
  const CACHE_MAX_ENTRIES = 4000;
  const MAX_CONCURRENT_FETCHES = 2;
  const MAX_ATTEMPTS = 2;
  const BLOCK_PAUSE_MS = 3 * 60 * 1000;
  const MAX_ROOT_DEPTH = 12;
  // Pages where filtering would get in the way (your own listings, a single item, ...).
  const EXCLUDED_PATHS = /^\/marketplace\/(?:item|you|inbox|create|notifications|selling|buying)(?:\/|$)/;

  const MISSING_LABELS = {
    year: 'rok ?',
    fuel: 'paliwo ?',
    transmission: 'skrzynia ?',
    mileage: 'przebieg ?',
  };

  let settings = FMF.normalizeSettings();
  let settingsLoaded = false;

  /**
   * id -> {
   *   id, cards: Map<root, anchor>, nearRoots: Set<root>,
   *   cardInfo, details, detailsState: 'none'|'cache'|'idle'|'queued'|'loading'|'done'|'error',
   *   attempts, state
   * }
   */
  const listings = new Map();
  const memoryCache = new Map();
  const queue = [];
  let activeFetches = 0;
  let pausedUntil = 0;
  let resumeTimer = null;
  let statusNote = '';

  // ---------------------------------------------------------------------------
  // Page / card discovery
  // ---------------------------------------------------------------------------

  function isActivePage() {
    return location.pathname.startsWith('/marketplace') && !EXCLUDED_PATHS.test(location.pathname);
  }

  function containsOtherItem(el, id) {
    for (const a of el.querySelectorAll(ITEM_LINK)) {
      const other = FMF.extractItemId(a.getAttribute('href'));
      if (other && other !== id) return true;
    }
    return false;
  }

  // The grid cell of a card: the highest ancestor of the link that does not
  // contain any other listing. Facebook's class names are obfuscated, so this
  // structural rule is more stable than any selector.
  function findCardRoot(anchor, id) {
    let el = anchor;
    for (let depth = 0; depth < MAX_ROOT_DEPTH; depth++) {
      const parent = el.parentElement;
      if (!parent || parent === document.body) break;
      if (containsOtherItem(parent, id)) return { root: el, certain: true };
      el = parent;
    }
    return { root: anchor, certain: false };
  }

  function newListing(id) {
    return {
      id,
      cards: new Map(),
      nearRoots: new Set(),
      cardInfo: null,
      details: null,
      detailsState: 'none',
      attempts: 0,
      state: null,
    };
  }

  function attach(anchor, id) {
    const { root, certain } = findCardRoot(anchor, id);
    const prevId = root.dataset.fmfCard;
    if (prevId && prevId !== id) detachRoot(root, prevId);

    let listing = listings.get(id);
    if (!listing) {
      listing = newListing(id);
      listings.set(id, listing);
    }
    root.dataset.fmfCard = id;
    root.classList.add('fmf-card');
    listing.cards.set(root, { anchor, certain });
    // React may reuse the DOM node for another listing, so re-read the card.
    listing.cardInfo = null;
    intersection.observe(root);
    applyListing(listing);
  }

  function detachRoot(root, id) {
    const listing = listings.get(id);
    if (listing) {
      listing.cards.delete(root);
      listing.nearRoots.delete(root);
      if (!listing.cards.size) listings.delete(id);
    }
    intersection.unobserve(root);
    clearRoot(root);
    delete root.dataset.fmfCard;
    root.classList.remove('fmf-card');
  }

  function clearRoot(root) {
    delete root.dataset.fmfState;
    root.classList.remove('fmf-has-badges');
    const box = root.querySelector('.fmf-badges');
    if (box) box.remove();
  }

  // Badges go on the bottom edge of the photo: Facebook uses the top-left
  // corner for its own "Posted just now" label.
  function badgeHost(root) {
    const img = root.querySelector('img');
    const host = img && img.parentElement;
    return host && host !== root && root.contains(host) ? host : root;
  }

  function scan() {
    if (!isActivePage() || !settingsLoaded) {
      updatePill();
      return;
    }
    for (const a of document.querySelectorAll(ITEM_LINK)) {
      const id = FMF.extractItemId(a.getAttribute('href'));
      if (!id || a.dataset.fmfId === id) continue;
      // Listing previews and other overlays.
      if (a.closest('[role="dialog"]')) continue;
      a.dataset.fmfId = id;
      attach(a, id);
    }

    for (const listing of listings.values()) {
      // The card may have been empty (still rendering) when first seen.
      if (listing.cardInfo && !listing.cardInfo.title) applyListing(listing);
      // The photo may load after the badges were drawn.
      for (const root of listing.cards.keys()) {
        const box = root.querySelector('.fmf-badges');
        if (box && box.parentElement !== badgeHost(root)) {
          applyListing(listing);
          break;
        }
      }
      for (const [root, entry] of listing.cards) {
        if (!root.isConnected) {
          detachRoot(root, listing.id);
        } else if (!entry.certain && entry.anchor.isConnected) {
          // More cards may have loaded since, so the cell can be found now.
          const found = findCardRoot(entry.anchor, listing.id);
          if (found.root !== root) {
            detachRoot(root, listing.id);
            delete entry.anchor.dataset.fmfId;
            scheduleScan();
          } else {
            entry.certain = found.certain;
          }
        }
      }
    }
    updatePill();
  }

  // ---------------------------------------------------------------------------
  // Evaluation and rendering
  // ---------------------------------------------------------------------------

  function firstConnectedRoot(listing) {
    for (const root of listing.cards.keys()) if (root.isConnected) return root;
    return null;
  }

  function canStillLoad(listing) {
    if (listing.detailsState === 'done') return false;
    return !(listing.detailsState === 'error' && listing.attempts >= MAX_ATTEMPTS);
  }

  function applyListing(listing) {
    if (!listing.cardInfo || !listing.cardInfo.title) {
      const root = firstConnectedRoot(listing);
      // Badges are drawn with CSS generated content, so innerText ignores them.
      // A display:none element has no line breaks in innerText, so skip those.
      if (root && root.dataset.fmfState !== 'hidden') listing.cardInfo = FMF.parseCardText(root.innerText);
    }

    const info = FMF.mergeInfo(listing.cardInfo, listing.details);
    const ev = FMF.evaluate(info, settings);

    let state;
    if (!settings.enabled) state = 'off';
    else if (ev.verdict === 'reject') state = 'reject';
    else if (ev.verdict === 'match') state = 'match';
    else if (settings.fetchDetails && !queryOutdated && canStillLoad(listing)) state = 'pending';
    else state = settings.unknownMode === 'hide' ? 'reject-unknown' : 'unknown';

    listing.state = state;
    for (const root of listing.cards.keys()) render(root, listing, state, info, ev);
    if (state === 'pending') ensureDetails(listing);
  }

  function refreshAll() {
    for (const listing of listings.values()) applyListing(listing);
    updatePill();
  }

  function render(root, listing, state, info, ev) {
    let visual = null;
    if (state === 'reject' || state === 'reject-unknown') visual = settings.rejectMode === 'dim' ? 'dimmed' : 'hidden';
    else if (state === 'pending' || state === 'unknown' || state === 'match') visual = state;

    if (visual === 'hidden' && containsOtherItem(root, listing.id)) {
      // Never hide a container holding other listings (grid was re-rendered).
      const entry = listing.cards.get(root);
      detachRoot(root, listing.id);
      if (entry) delete entry.anchor.dataset.fmfId;
      scheduleScan();
      return;
    }

    if (visual) root.dataset.fmfState = visual;
    else delete root.dataset.fmfState;
    renderBadges(root, state, info, ev);
  }

  function chipKind(field, ev, active) {
    if (ev.failed.includes(field)) return 'bad';
    return active[field] ? 'good' : 'info';
  }

  function renderBadges(root, state, info, ev) {
    let box = root.querySelector('.fmf-badges');
    if (!settings.showBadges || state === 'off') {
      if (box) box.remove();
      root.classList.remove('fmf-has-badges');
      return;
    }

    const active = FMF.activeFilters(settings);
    const chips = [];
    if (info.year) chips.push([String(info.year), chipKind('year', ev, active)]);
    if (info.fuels && info.fuels.length) {
      chips.push([info.fuels.map((f) => FMF.FUEL_LABELS[f]).join(' + '), chipKind('fuel', ev, active)]);
    }
    if (info.transmission) chips.push([FMF.TRANSMISSION_LABELS[info.transmission], chipKind('transmission', ev, active)]);
    if (info.mileageKm != null && ev.failed.includes('mileage')) chips.push([FMF.formatMileage(info.mileageKm), 'bad']);
    if (state === 'pending') chips.push(['sprawdzam opis…', 'pending']);
    else if (ev.verdict !== 'reject') for (const field of ev.missing) chips.push([MISSING_LABELS[field], 'unknown']);

    const signature = JSON.stringify(chips);
    const host = badgeHost(root);
    if (box && box.dataset.sig === signature && box.parentElement === host) return;
    if (!chips.length) {
      if (box) box.remove();
      root.classList.remove('fmf-has-badges');
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'fmf-badges';
    }
    if (box.parentElement !== host) {
      for (const old of root.querySelectorAll('.fmf-badge-host')) old.classList.remove('fmf-badge-host');
      host.classList.add('fmf-badge-host');
      host.appendChild(box);
    }
    root.classList.add('fmf-has-badges');
    box.dataset.sig = signature;
    box.replaceChildren(
      ...chips.map(([text, kind]) => {
        const chip = document.createElement('span');
        chip.className = 'fmf-chip';
        chip.dataset.kind = kind;
        chip.dataset.text = text;
        return chip;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Listing details (fetched from the listing page, cached)
  // ---------------------------------------------------------------------------

  const intersection = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const listing = listings.get(e.target.dataset.fmfCard);
        if (!listing) continue;
        if (e.isIntersecting) listing.nearRoots.add(e.target);
        else listing.nearRoots.delete(e.target);
        if (listing.nearRoots.size && listing.state === 'pending') ensureDetails(listing);
      }
    },
    { rootMargin: '800px 0px' }
  );

  function ensureDetails(listing) {
    if (listing.detailsState === 'none') {
      listing.detailsState = 'cache';
      readCache(listing.id).then((info) => {
        if (listing.detailsState !== 'cache') return;
        if (info) {
          listing.details = info;
          listing.detailsState = 'done';
          applyListing(listing);
          updatePill();
        } else {
          listing.detailsState = 'idle';
          enqueue(listing);
        }
      });
    } else if (listing.detailsState === 'idle' || listing.detailsState === 'error') {
      enqueue(listing);
    }
  }

  function enqueue(listing) {
    // Only fetch what the user is about to see; the observer re-triggers later.
    if (!listing.nearRoots.size) return;
    listing.detailsState = 'queued';
    queue.push(listing);
    pump();
  }

  function pump() {
    const wait = pausedUntil - Date.now();
    if (wait > 0 || queryOutdated) return;
    while (activeFetches < MAX_CONCURRENT_FETCHES && queue.length) {
      const listing = queue.shift();
      if (listing.detailsState !== 'queued') continue;
      if (listing.state !== 'pending' || !listing.nearRoots.size || !listings.has(listing.id)) {
        listing.detailsState = 'idle';
        continue;
      }
      activeFetches++;
      listing.detailsState = 'loading';
      loadDetails(listing).finally(() => {
        activeFetches--;
        // Be gentle with Facebook: a short random pause between requests.
        setTimeout(pump, 400 + Math.random() * 700);
      });
    }
  }

  async function loadDetails(listing) {
    try {
      const info = await fetchDetails(listing.id);
      listing.details = info;
      listing.detailsState = 'done';
      memoryCache.set(listing.id, info);
      if (info.title || info.year || info.fuels || info.transmission) writeCache(listing.id, info);
      else console.info('[Filtr aut] Brak danych w ogłoszeniu', listing.id);
    } catch (err) {
      if (err && err.blocked) {
        listing.detailsState = 'idle';
        pauseFetching();
      } else if (err && err.outdated) {
        listing.detailsState = 'idle';
        queryOutdated = true;
        statusNote = OUTDATED_NOTE;
        refreshAll();
      } else {
        listing.attempts++;
        listing.detailsState = 'error';
      }
    }
    if (listings.has(listing.id)) applyListing(listing);
    updatePill();
  }

  function pauseFetching() {
    pausedUntil = Date.now() + BLOCK_PAUSE_MS;
    statusNote = 'Facebook ogranicza zapytania – sprawdzanie opisów wstrzymane na 3 min.';
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      statusNote = '';
      refreshAll();
      pump();
    }, BLOCK_PAUSE_MS);
  }

  // The listing page HTML is only an app shell; the listing itself is loaded
  // with this GraphQL query. Its id/variables change with Facebook releases;
  // page-hook.js picks up the current ones whenever the user opens a listing.
  const PDP_QUERY_NAME = 'MarketplacePDPContainerQuery';
  const DEFAULT_PDP_QUERY = {
    docId: '28633625649641172',
    variables: {
      enableJobEmployerActionBar: false,
      enableJobSeekerActionBar: false,
      feedbackSource: 56,
      feedLocation: 'MARKETPLACE_MEGAMALL',
      referralCode: 'undefined',
      referralSurfaceString: 'category_feed',
      scale: 1,
      shouldFetchLoggedOutSimilarListings: false,
      targetId: '',
      useDefaultActor: false,
      __relay_internal__pv__MarketplacePDPCometSimilarListingsrelayprovider: false,
      __relay_internal__pv__MarketplacePDPShouldShowRelatedSearchesrelayprovider: true,
      __relay_internal__pv__MarketplacePDPShouldShowLoggedOutSellerTrustrelayprovider: false,
      __relay_internal__pv__ShouldUpdateMarketplaceBoostListingBoostedStatusrelayprovider: false,
      __relay_internal__pv__MarketplacePDPIsLoggedOutrelayprovider: false,
      __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: false,
      __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
      __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
      __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: true,
      __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'ORIGINAL',
      __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
      __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: true,
      __relay_internal__pv__IsWorkUserrelayprovider: false,
      __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
      __relay_internal__pv__CometUFISingleLineUFIrelayprovider: true,
      __relay_internal__pv__MarketplacePDPShouldShowBSGRecommendationsrelayprovider: false,
      __relay_internal__pv__MarketplacePDPJobShouldShowSharedGroupsSectionrelayprovider: false,
      __relay_internal__pv__MarketplacePDPJobIsShareToGroupsEnabledOnCometrelayprovider: false,
    },
  };
  const OUTDATED_NOTE = 'Facebook zmienił sposób ładowania ogłoszeń – otwórz dowolne ogłoszenie, a filtr się dostosuje.';

  let pdpQuery = DEFAULT_PDP_QUERY;
  let queryOutdated = false;
  let fbTokens = null;

  function tokensFromText(text) {
    const dtsg = /"DTSGInitialData",\[\],\{"token":"([^"]+)"/.exec(text);
    const lsd = /"LSD",\[\],\{"token":"([^"]+)"/.exec(text);
    return dtsg ? { dtsg: dtsg[1], lsd: lsd ? lsd[1] : '' } : null;
  }

  async function getTokens() {
    if (fbTokens) return fbTokens;
    let dtsg = null;
    let lsd = '';
    for (const s of document.querySelectorAll('script:not([src])')) {
      const t = s.textContent;
      if (!dtsg && t.includes('DTSGInitialData')) dtsg = (tokensFromText(t) || {}).dtsg || null;
      if (!lsd && t.includes('"LSD"')) lsd = (/"LSD",\[\],\{"token":"([^"]+)"/.exec(t) || [])[1] || '';
    }
    if (dtsg) return (fbTokens = { dtsg, lsd });
    // Single-page navigation can leave no inline scripts behind; a fresh page has them.
    const res = await fetch(`${location.origin}/marketplace/`, { credentials: 'include' });
    fbTokens = tokensFromText(await res.text());
    if (!fbTokens) throw blockedError();
    return fbTokens;
  }

  function blockedError() {
    const err = new Error('blocked');
    err.blocked = true;
    return err;
  }

  async function fetchDetails(id) {
    const tokens = await getTokens();
    const body = new URLSearchParams({
      fb_dtsg: tokens.dtsg,
      lsd: tokens.lsd,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: PDP_QUERY_NAME,
      variables: JSON.stringify(Object.assign({}, pdpQuery.variables, { targetId: id })),
      server_timestamps: 'true',
      doc_id: pdpQuery.docId,
    });
    const res = await fetch(`${location.origin}/api/graphql/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-fb-lsd': tokens.lsd, 'x-fb-friendly-name': PDP_QUERY_NAME },
      body,
    });
    if (res.status === 429) throw blockedError();
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();

    if (text.startsWith('for (;;);')) {
      // Session-level error (expired token, logged out): fetch new tokens next time.
      fbTokens = null;
      if (/"error":1357001/.test(text)) throw blockedError();
      throw new Error('session error');
    }
    if (!text.includes('"marketplace_listing_title"')) {
      if (/rate.?limit|"code":1675004|"code":368\b/i.test(text)) throw blockedError();
      if (/missing_required_variable|persisted|doc_id|document/i.test(text)) {
        const err = new Error('query outdated');
        err.outdated = true;
        throw err;
      }
      throw new Error('no listing data');
    }
    return FMF.analyzeDetails(FMF.parseItemHtml(text));
  }

  function setPdpQuery(q, persist) {
    if (!q || !q.docId || !q.variables) return;
    const changed = q.docId !== pdpQuery.docId || JSON.stringify(q.variables) !== JSON.stringify(pdpQuery.variables);
    pdpQuery = { docId: String(q.docId), variables: Object.assign({}, q.variables, { targetId: '' }) };
    if (persist && changed) {
      try {
        chrome.storage.local.set({ pdpQuery: Object.assign({ t: Date.now() }, pdpQuery) });
      } catch (e) {
        /* orphaned content script */
      }
    }
    if (changed && queryOutdated) {
      queryOutdated = false;
      if (statusNote === OUTDATED_NOTE) statusNote = '';
      for (const listing of listings.values()) {
        if (listing.detailsState === 'error') {
          listing.detailsState = 'idle';
          listing.attempts = 0;
        }
      }
      refreshAll();
      pump();
    }
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'fmf-page-hook' || d.type !== 'pdp-query') return;
    setPdpQuery(d, true);
  });

  async function readCache(id) {
    if (memoryCache.has(id)) return memoryCache.get(id);
    const key = CACHE_PREFIX + id;
    try {
      const entry = (await chrome.storage.local.get(key))[key];
      if (entry && entry.v === FMF.PARSER_VERSION && Date.now() - entry.t < CACHE_TTL_MS) {
        memoryCache.set(id, entry.i);
        return entry.i;
      }
    } catch (e) {
      // Extension was reloaded; this content script is orphaned.
    }
    return null;
  }

  function writeCache(id, info) {
    try {
      chrome.storage.local.set({ [CACHE_PREFIX + id]: { t: Date.now(), v: FMF.PARSER_VERSION, i: info } }).catch(() => {});
    } catch (e) {
      /* orphaned content script */
    }
  }

  async function pruneCache() {
    try {
      const all = await chrome.storage.local.get(null);
      const now = Date.now();
      const entries = Object.entries(all).filter(([k]) => k.startsWith(CACHE_PREFIX));
      const stale = entries.filter(([, e]) => !e || e.v !== FMF.PARSER_VERSION || now - e.t > CACHE_TTL_MS).map(([k]) => k);
      const fresh = entries.filter(([k]) => !stale.includes(k)).sort((a, b) => b[1].t - a[1].t);
      const excess = fresh.slice(CACHE_MAX_ENTRIES).map(([k]) => k);
      if (stale.length || excess.length) await chrome.storage.local.remove(stale.concat(excess));
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------------
  // Status pill
  // ---------------------------------------------------------------------------

  let pill = null;
  let pillText = null;
  let pillFrame = 0;

  function computeStats() {
    const stats = { active: isActivePage(), enabled: settings.enabled, total: 0, shown: 0, hidden: 0, pending: 0, unknown: 0, note: statusNote };
    for (const listing of listings.values()) {
      if (!firstConnectedRoot(listing)) continue;
      stats.total++;
      if (listing.state === 'pending') stats.pending++;
      else if (listing.state === 'reject' || listing.state === 'reject-unknown') stats.hidden++;
      else {
        stats.shown++;
        if (listing.state === 'unknown') stats.unknown++;
      }
    }
    const active = FMF.activeFilters(settings);
    stats.hasFilters = Object.values(active).some(Boolean);
    return stats;
  }

  function updatePill() {
    if (pillFrame) return;
    pillFrame = requestAnimationFrame(() => {
      pillFrame = 0;
      renderPill();
    });
  }

  function saveSettings(next) {
    try {
      chrome.storage.sync.set({ settings: next });
    } catch (e) {
      statusNote = 'Odśwież stronę – rozszerzenie zostało zaktualizowane.';
      updatePill();
    }
  }

  function renderPill() {
    if (!isActivePage() || !settingsLoaded) {
      if (pill) pill.hidden = true;
      ensurePanel();
      return;
    }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'fmf-pill';
      pillText = document.createElement('span');
      pillText.className = 'fmf-pill-text';
      pillText.title = 'Filtr aut – kliknij, aby włączyć/wyłączyć';
      pillText.addEventListener('click', () => saveSettings(Object.assign({}, settings, { enabled: !settings.enabled })));
      const gear = document.createElement('button');
      gear.type = 'button';
      gear.className = 'fmf-pill-gear';
      gear.textContent = 'Filtry';
      gear.title = 'Pokaż ustawienia filtra';
      gear.addEventListener('click', showPanel);
      pill.append(pillText, gear);
      document.body.appendChild(pill);
    }
    const s = computeStats();
    ensurePanel();
    panel.setStats(s);
    // The docked panel shows the same numbers, so the pill would only cover the sidebar.
    pill.hidden = !panel.host.classList.contains('floating');
    let text;
    if (!s.enabled) text = 'Filtr aut: wyłączony (kliknij, aby włączyć)';
    else if (!s.hasFilters) text = 'Filtr aut: brak filtrów – ustaw je w panelu „Filtry”';
    else {
      const parts = [`${s.shown} pasuje`];
      if (s.hidden) parts.push(`${s.hidden} ${settings.rejectMode === 'dim' ? 'przyciemnionych' : 'ukrytych'}`);
      if (s.pending) parts.push(`${s.pending} sprawdzam`);
      if (s.unknown) parts.push(`${s.unknown} bez danych`);
      text = 'Filtr aut: ' + parts.join(' · ');
    }
    if (s.note) text += ' — ' + s.note;
    pill.dataset.off = String(!s.enabled);
    if (pillText.textContent !== text) pillText.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Filter panel (in Facebook's left sidebar, or floating when there is none)
  // ---------------------------------------------------------------------------

  let panel = null;
  let floatingOpen = false;

  function createPanel() {
    panel = FMF.createPanel({
      save: saveSettings,
      clearCache: clearDetailsCache,
      saveCollapsed(collapsed) {
        try {
          chrome.storage.local.set({ panelCollapsed: collapsed });
        } catch (e) {
          /* orphaned content script */
        }
      },
      onClose() {
        floatingOpen = false;
        ensurePanel();
      },
    });
    panel.setSettings(settings);
    try {
      chrome.storage.local.get('panelCollapsed').then(({ panelCollapsed }) => panel.setCollapsed(!!panelCollapsed), () => {});
    } catch (e) {
      /* orphaned content script */
    }
  }

  // Facebook's class names are obfuscated and its texts are localised, so the
  // slot is found structurally: the sidebar is the wide navigation landmark with
  // a page heading (h1); its "Filters" section is the one holding the h2.
  function findSidebarSlot() {
    for (const nav of document.querySelectorAll('[role="navigation"]')) {
      if (!nav.querySelector('h1')) continue;
      const rect = nav.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 200) continue;
      const heading = nav.querySelector('h2');
      if (!heading) continue;
      let section = heading;
      while (section.parentElement && section.parentElement !== nav && section.parentElement.childElementCount < 3) {
        section = section.parentElement;
      }
      if (section.parentElement === nav || !section.parentElement) continue;
      return { parent: section.parentElement, after: section };
    }
    return null;
  }

  function ensurePanel() {
    if (!isActivePage() || !settingsLoaded) {
      if (panel) panel.host.hidden = true;
      floatingOpen = false;
      return;
    }
    if (!panel) createPanel();
    const host = panel.host;
    const slot = findSidebarSlot();
    if (slot) {
      host.classList.remove('floating');
      host.hidden = false;
      floatingOpen = false;
      if (host.parentElement !== slot.parent || host.previousElementSibling !== slot.after) slot.after.after(host);
    } else {
      host.classList.add('floating');
      host.hidden = !floatingOpen;
      if (host.parentElement !== document.body) document.body.appendChild(host);
    }
  }

  function showPanel() {
    ensurePanel();
    const host = panel.host;
    if (host.classList.contains('floating')) {
      floatingOpen = !floatingOpen;
      host.hidden = !floatingOpen;
      if (floatingOpen) panel.setCollapsed(false);
      return;
    }
    panel.setCollapsed(false);
    host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    host.classList.remove('flash');
    void host.offsetWidth;
    host.classList.add('flash');
  }

  async function clearDetailsCache() {
    try {
      const all = await chrome.storage.local.get(null);
      await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX)));
      await chrome.storage.local.set({ cacheClearedAt: Date.now() });
    } catch (e) {
      /* orphaned content script */
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 250);
  }

  const mutations = new MutationObserver(scheduleScan);
  let observing = false;
  let lastHref = '';

  function syncObserver() {
    const active = isActivePage();
    if (active && !observing) {
      mutations.observe(document.body, { childList: true, subtree: true });
      observing = true;
    } else if (!active && observing) {
      mutations.disconnect();
      observing = false;
    }
  }

  // Facebook is a single-page app and content scripts cannot hook its
  // history calls, so watch the URL.
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    syncObserver();
    scheduleScan();
    updatePill();
  }, 700);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      settings = FMF.normalizeSettings(changes.settings.newValue);
      if (panel) panel.setSettings(settings);
      refreshAll();
      pump();
    }
    if (area === 'local' && changes.pdpQuery && changes.pdpQuery.newValue) setPdpQuery(changes.pdpQuery.newValue, false);
    if (area === 'local' && changes.cacheClearedAt) {
      memoryCache.clear();
      for (const listing of listings.values()) {
        listing.details = null;
        listing.detailsState = 'none';
        listing.attempts = 0;
      }
      refreshAll();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'fmf:stats') sendResponse(computeStats());
  });

  Promise.all([chrome.storage.sync.get('settings'), chrome.storage.local.get('pdpQuery')])
    .then(([{ settings: stored }, { pdpQuery: learned }]) => {
      settings = FMF.normalizeSettings(stored);
      if (panel) panel.setSettings(settings);
      if (learned) setPdpQuery(learned, false);
    })
    .catch(() => {})
    .finally(() => {
      settingsLoaded = true;
      lastHref = location.href;
      syncObserver();
      scan();
    });

  setTimeout(pruneCache, 15000);
})();
