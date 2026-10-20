/*
 * Runs in the page's own JS world (not the isolated content-script world).
 * Facebook changes the id and variables of the GraphQL query that loads a
 * listing from time to time; this watches Facebook's own request for it (sent
 * whenever the user opens any listing) and hands the current version to the
 * content script, so fetching listing details keeps working after an update.
 */
(() => {
  'use strict';

  if (window.__fmfPageHook) return;
  window.__fmfPageHook = true;

  const QUERY_NAME = 'MarketplacePDPContainerQuery';

  function inspect(body) {
    try {
      if (typeof body !== 'string' && !(body instanceof URLSearchParams)) return;
      const text = String(body);
      if (!text.includes(QUERY_NAME)) return;
      const params = new URLSearchParams(text);
      if (params.get('fb_api_req_friendly_name') !== QUERY_NAME) return;
      const docId = params.get('doc_id');
      const variables = JSON.parse(params.get('variables') || 'null');
      if (!docId || !variables) return;
      window.postMessage({ source: 'fmf-page-hook', type: 'pdp-query', docId, variables }, location.origin);
    } catch (e) {
      /* never break Facebook's own requests */
    }
  }

  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    inspect(body);
    return send.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    if (init && init.body) inspect(init.body);
    return origFetch.apply(this, arguments);
  };
})();
