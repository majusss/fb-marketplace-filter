/*
 * Pure parsing / filtering logic shared by the content script, the popup and
 * the Node tests. No DOM or chrome.* access in here.
 */
(function (root) {
  'use strict';

  // Bump when detection logic changes so cached results get recomputed.
  const PARSER_VERSION = 6;

  const FUELS = ['petrol', 'diesel', 'lpg', 'hybrid', 'electric'];
  const TRANSMISSIONS = ['manual', 'automatic'];

  const FUEL_LABELS = {
    petrol: 'Benzyna',
    diesel: 'Diesel',
    lpg: 'LPG/CNG',
    hybrid: 'Hybryda',
    electric: 'Elektryczny',
  };

  const TRANSMISSION_LABELS = {
    manual: 'Manualna',
    automatic: 'Automat',
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    yearMin: null,
    yearMax: null,
    fuels: [],
    transmissions: [],
    mileageMax: null,
    unknownMode: 'show', // 'show' | 'hide' – listings where the data could not be found
    rejectMode: 'hide', // 'hide' | 'dim' – listings that do not match
    partsHide: false, // hide listings that are not a car (parts / accessories)
    fetchDetails: true,
    showBadges: true,
    debugLog: false, // write the diagnostics log to the browser console
  };

  const YEAR_MIN = 1930;

  function maxYear() {
    return new Date().getFullYear() + 1;
  }

  function plausibleYear(y) {
    return Number.isInteger(y) && y >= YEAR_MIN && y <= maxYear();
  }

  // ---------------------------------------------------------------------------
  // Text helpers
  // ---------------------------------------------------------------------------

  const DIACRITICS = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

  // Lowercase, strip Polish diacritics (people often type without them) and
  // unify exotic spaces, so every pattern below can be plain ASCII.
  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch])
      .replace(/[    ]/g, ' ');
  }

  const CLAUSE_SPLIT = /[.,;!?()[\]\n|•*]/;

  function clauseBefore(text, index, maxLen) {
    const parts = text.slice(Math.max(0, index - maxLen), index).split(CLAUSE_SPLIT);
    return parts[parts.length - 1];
  }

  function clauseAfter(text, index, maxLen) {
    return text.slice(index, index + maxLen).split(CLAUSE_SPLIT)[0];
  }

  function lastWords(chunk, n) {
    const words = chunk.trim().split(/\s+/).filter(Boolean);
    return words.slice(-n);
  }

  const NEGATION_WORDS = new Set(['bez', 'nie', 'brak', 'zamiast', 'not', 'without']);
  const NEGATION_PAIR = /^(?:(?:nie|nigdy)\s+(?:ma|mial|miala|mialo|posiada|posiadal|posiadala|bylo|byl|byla|jest|has|had)|(?:zamienie|zamiana|zamiane|zamienic|szukam)\s+na)$/;

  // "bez LPG", "nie ma automatu", "nigdy nie miał gazu", "zamienię na diesla"
  function isNegated(text, index) {
    const before = clauseBefore(text, index, 40);
    const words = lastWords(before, 2);
    if (words.length && NEGATION_WORDS.has(words[words.length - 1])) return true;
    return words.length === 2 && NEGATION_PAIR.test(words.join(' '));
  }

  // Words that, right next to a bare "automat"/"manualna", mean it is about
  // something other than the gearbox ("klimatyzacja automatyczna",
  // "manualna regulacja foteli", "klima automat").
  const NON_GEARBOX_STEMS = [
    'klim', 'aircon', 'climat', 'fotel', 'regul', 'luster', 'swiatl', 'szyb', 'wycierac',
    'ogrzew', 'podgrzew', 'siedz', 'kierown', 'dach', 'klap', 'okn', 'zamk', 'parkow',
    'hamul', 'zmierzch', 'skladan', 'sciem', 'wlacz', 'nawiew', 'kaw', 'pral', 'drzwi',
  ];

  function hasNonGearboxNeighbour(text, start, end) {
    const prev = lastWords(clauseBefore(text, start, 30), 1)[0];
    const next = clauseAfter(text, end, 30).trim().split(/\s+/)[0];
    return [prev, next].some((w) => w && NON_GEARBOX_STEMS.some((s) => w.startsWith(s)));
  }

  // Counts matches of the given patterns that are not negated (and, for
  // "bare" patterns, not obviously about another piece of equipment).
  function countMatches(text, patterns) {
    let count = 0;
    for (const p of patterns) {
      const re = p instanceof RegExp ? p : p.re;
      const bare = !(p instanceof RegExp) && p.bare;
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        if (isNegated(text, m.index)) continue;
        if (bare && hasNonGearboxNeighbour(text, m.index, m.index + m[0].length)) continue;
        count++;
      }
    }
    return count;
  }

  // Values of "Label: value" pairs, e.g. "Rodzaj paliwa: Benzyna + LPG".
  function labeledValues(text, labelSource) {
    const re = new RegExp('(?:^|[^a-z])(?:' + labelSource + ')\\s*[:=\\-–—]\\s*([^\\n;|,]{1,40})', 'g');
    const values = [];
    for (const m of text.matchAll(re)) {
      // Cut at a sentence end, but keep decimals like "2.0 tdi".
      values.push(m[1].split(/\.(?!\d)/)[0].trim());
    }
    return values;
  }

  // ---------------------------------------------------------------------------
  // Fuel
  // ---------------------------------------------------------------------------

  const FUEL_PATTERNS = {
    diesel: [
      /\bdi(?:e?sel|esl)\w*/g,
      /\bdizel\w*/g, // "2.2 dizel" - Polish spelling of diesel
      /\bolej\w*\s+napedow\w*/g,
      /\b(?:tdi|tdci|cdi|crdi|hdi|bluehdi|e-?hdi|dci|cdti|jtd|jtdm|multijet|d-?4d|tddi|sdi|crd|ctdi|i-?ctdi|i-?dtec|dtec|bluetec|skyactiv-?d|tdv6|tdv8|td4|sd4|ed4|ecoblue|duratorq|bitdi)\b/g,
      /(?<![a-z\d])[a-z]?\d{3}x?d\b/g, // BMW / Mercedes: 320d, 530xd, c220d
      /\b\d[.,]\d\s?d\b/g, // 2.0d, 1.6 d
    ],
    petrol: [
      /\bbenzyn\w*/g,
      /\b(?:petrol|gasoline)\b/g,
      /\bpb\s?-?9[58]\b/g,
      /\bpb\b/g,
      /\b(?:tsi|tfsi|e-?tsi|fsi|mpi|vtec|i-?vtec|ecoboost|t-?jet|tce|puretech|vvt-?i|gdi|t-?gdi|sce|thp|mivec|skyactiv-?g|ti-?vct|multiair|kompressor|vti|cgi|ecotec|twinair)\b/g,
      /(?<![a-z\d])[a-z]?\d{3}x?i\b/g, // BMW 320i, m340i
      /\b\d[.,]\d\s?i\b(?!\s*-)/g, // 1.4i - but not the "i" of "2.2 i-DTEC"
    ],
    lpg: [
      /\b(?:lpg|cng)\b/g,
      /\bautogaz\w*/g,
      /\binstalacj\w*\s+gazow\w*/g,
      /\b(?:uklad|system|zespol|wtrysk)\w*\s+gazow\w*/g,
      /\b(?:na|z)\s+gaz(?:ie|em)?\b/g,
      /\+\s*gaz\b/g,
      /\b\d[.,]\d\s*gaz\b/g, // "Accord 2.0 GAZ"
      /\bbutl[aeiy]\w*/g, // "butla gazu na 8 lat", "legalizacja butli"
      /\bzbiornik\w*\s+(?:na\s+)?(?:gaz|lpg)\w*/g,
      /\bsekwencyjn\w*\s+gaz\w*/g, // "z sekwencyjnym gazem"
      // "gaz jest do 2033", "gaz ważny do 2031", "gaz w aucie".
      /\bgaz\s+(?:jest|wazn\w*|do\s+\d|serwis\w*|w\s+aucie|w\s+samochodzie|zainstalowan\w*|w\s+roku|uklad\w*)/g,
      /\bgaz\b(?=\s*(?:[.,;!?]|$))/g,
      // "z gazem", "na gazie", "ważność gazu" - but not "pedal gazu".
      // Stems are written without diacritics: normalize() strips them.
      /(?<!\b(?:amortyzator|sprezyn|hamulc|pedal|linka|przycisk|pasek|tloczek|silownik|kotwic|wydech|zawor|podusz|tysn|plyn|filtr|wal)\w*\s)\bgaz(?:em|ie|u)\b/g,
      /\bgaz\s*\+/g,
      /\bb\s?\+\s?g\b/g,
      /\bgaz\s+(?:sekwencj\w*|brc|landi\w*|prins|stag)\b/g,
      /\b(?:brc|landi\s?renzo|prins|lovato|zavoli|tartarini)\b/g,
    ],
    hybrid: [
      /\bhybryd\w*/g,
      /\bhybrid\w*/g,
      /\b(?:phev|mhev|hev|plug-?in)\b/g,
    ],
    electric: [
      // Deliberately strict: "elektryczne szyby/lusterka" is in nearly every ad.
      /\b(?:samochod|auto|pojazd|woz)\w*\s+(?:w\s+pelni\s+|calkowicie\s+|w\s+100\s?%\s+)?elektryczn\w*/g,
      /\b100\s?%\s*elektryczn\w*/g,
      /\belektryk\b/g,
      /\bbev\b/g,
      /\b(?:fully\s+electric|electric\s+(?:car|vehicle))\b/g,
    ],
  };

  const FUEL_LABEL_SOURCE = '(?:rodzaj|typ)\\s+paliwa|paliwo|fuel(?:\\s+type)?|zasilanie';
  const ENGINE_LABEL_SOURCE = 'silnik|engine';

  function classifyFuelValue(value, isFuelLabel) {
    const found = new Set();
    for (const fuel of FUELS) {
      if (countMatches(value, FUEL_PATTERNS[fuel])) found.add(fuel);
    }
    if (!isFuelLabel) return found;
    // Short forms that are only safe right after a "Paliwo:" label.
    if (/^(?:on|ropa)\b/.test(value)) found.add('diesel');
    if (/\bgaz\b/.test(value)) found.add('lpg');
    if (/\belektr/.test(value)) found.add('electric');
    if (/^benz\b/.test(value)) found.add('petrol');
    return found;
  }

  // Returns an array of fuel ids or null when nothing was found.
  function detectFuels(text) {
    const t = normalize(text);
    const labeled = new Set();
    for (const v of labeledValues(t, FUEL_LABEL_SOURCE)) {
      for (const f of classifyFuelValue(v, true)) labeled.add(f);
    }
    for (const v of labeledValues(t, ENGINE_LABEL_SOURCE)) {
      for (const f of classifyFuelValue(v, false)) labeled.add(f);
    }

    const counts = {};
    for (const fuel of FUELS) counts[fuel] = countMatches(t, FUEL_PATTERNS[fuel]);

    let found;
    if (labeled.size) {
      found = labeled;
      // A label often names only the base fuel ("Paliwo: benzyna") while the
      // gas installation is mentioned elsewhere in the description.
      if (counts.lpg) found.add('lpg');
    } else {
      found = new Set(FUELS.filter((f) => counts[f] > 0));
      // Mentions of both diesel and petrol: trust the clearly dominant one.
      if (found.has('diesel') && found.has('petrol')) {
        if (counts.diesel > counts.petrol) found.delete('petrol');
        else if (counts.petrol > counts.diesel) found.delete('diesel');
      }
    }
    // A gas installation is (almost always) fitted to a petrol engine: "1.8 + LPG".
    if (found.has('lpg') && !found.has('diesel') && !found.has('hybrid') && !found.has('electric')) found.add('petrol');
    return found.size ? FUELS.filter((f) => found.has(f)) : null;
  }

  // Facebook's own vehicle_fuel_type enum (GASOLINE, DIESEL, HYBRID, ...).
  function mapFacebookFuel(value) {
    const v = String(value || '').toUpperCase();
    if (!v) return null;
    if (v.includes('HYBRID')) return ['hybrid'];
    if (v.includes('DIESEL')) return ['diesel'];
    if (v.includes('ELECTRIC')) return ['electric'];
    if (/LPG|CNG|NATURAL_GAS|PROPANE/.test(v)) return ['lpg'];
    if (/GAS|PETROL|FLEX/.test(v)) return ['petrol'];
    return null;
  }

  // ---------------------------------------------------------------------------
  // Transmission
  // ---------------------------------------------------------------------------

  // Words allowed between "skrzynia" and its type: "skrzynia 6-biegowa manualna",
  // "skrzynia biegów jest automatyczna".
  const GEARBOX_FILLER = '(?:(?:\\d+\\s*-?\\s*)?biegow\\w*|jest|typu|to|tez|rowniez|\\d+)';
  const GEARBOX_PREFIX = '\\bskrzyni\\w*(?:\\s+' + GEARBOX_FILLER + '){0,2}\\s+';

  const TRANSMISSION_PATTERNS = {
    automatic: [
      new RegExp(GEARBOX_PREFIX + '(?:automat|polautomat|sekwencyjn)\\w*', 'g'),
      /\b(?:automatyczn|polautomatyczn)\w*\s+skrzyni\w*/g,
      /\bsekwencyjn\w*\s+skrzyni\w*\b(?!\s*gazow)/g, // "sekwencyjna skrzynia biegów"
      { re: /\b(?:automat|automatem|polautomat\w*)\b/g, bare: true },
      /\b(?:dsg\d*|s[\s-]?tronic|tiptronic|multitronic|steptronic|sportronic|\dg[\s-]?tronic|g-tronic|geartronic|powershift|speedshift|xtronic|lineartronic|e-?cvt|cvt|edc|dct|pdk|selespeed|easytronic|durashift|dualogic|smg|zf\s?\dhp|aisin)\b/g,
      /\bautomatic\s+(?:transmission|gearbox)\b/g,
      /\b(?:transmission|gearbox)\s*:?\s*automatic\b/g,
    ],
    manual: [
      new RegExp(GEARBOX_PREFIX + '(?:manual|reczn)\\w*', 'g'),
      /\b(?:manualn|reczn)\w*\s+skrzyni\w*/g,
      { re: /\b(?:manual|manualem|manualna|manualny)\b/g, bare: true },
      /\bmanual\s+(?:transmission|gearbox)\b/g,
      /\bstick\s?shift\b/g,
    ],
  };

  // "6-biegowa" on its own usually means a manual, but is weaker evidence.
  const WEAK_MANUAL = [/\b[4-7]\s*-?\s*biegow\w*/g];

  const TRANSMISSION_LABEL_SOURCE = 'skrzyni[ae]?(?:\\s+biegow)?|przekladni[ae]?|gearbox|transmission';

  function classifyTransmissionValue(value) {
    const auto = /automat|dsg|tronic|cvt|powershift|edc|dct|pdk|sekwencyj/.test(value);
    const manual = /manual|reczn|stick/.test(value);
    if (auto && !manual) return 'automatic';
    if (manual && !auto) return 'manual';
    if (!auto && !manual && /\d\s*-?\s*biegow/.test(value)) return 'manual';
    return null;
  }

  // Returns 'manual' | 'automatic' | null.
  function detectTransmission(text) {
    const t = normalize(text);
    for (const v of labeledValues(t, TRANSMISSION_LABEL_SOURCE)) {
      const r = classifyTransmissionValue(v);
      if (r) return r;
    }
    const auto = countMatches(t, TRANSMISSION_PATTERNS.automatic);
    const manual = countMatches(t, TRANSMISSION_PATTERNS.manual);
    if (auto > manual) return 'automatic';
    if (manual > auto) return 'manual';
    if (auto === 0 && countMatches(t, WEAK_MANUAL)) return 'manual';
    return null;
  }

  function mapFacebookTransmission(value) {
    const v = String(value || '').toUpperCase();
    if (v.includes('AUTO')) return 'automatic';
    if (v.includes('MANUAL')) return 'manual';
    return null;
  }

  // ---------------------------------------------------------------------------
  // Year
  // ---------------------------------------------------------------------------

  const YEAR_IN_TITLE = /(?<![\d.,])((?:19|20)\d{2})(?![\d])(?![.,]\d)(?!\s*(?:cm|ccm|cc|km|zl|pln|eur|tys|kg|nm|obr|kw|mil|l\b|[$€£]))/g;

  // "2015 Volkswagen Golf" (Facebook's vehicle title format) or "Golf VII 2015r".
  function yearFromTitle(title) {
    const t = normalize(title);
    const start = /^\s*((?:19|20)\d{2})(?!\d)/.exec(t);
    if (start && plausibleYear(+start[1])) return +start[1];
    for (const m of t.matchAll(YEAR_IN_TITLE)) {
      if (plausibleYear(+m[1])) return +m[1];
    }
    return null;
  }

  const YEAR_LABELED = /(?:^|[^a-z])(?:rok\s+produkcji|rok\s+prod\.?|r\.\s*prod\.?|rocznik|year)\s*[:\-–]?\s*((?:19|20)\d{2})(?!\d)|(?:^|[^a-z])rok\s*[:\-–]\s*((?:19|20)\d{2})(?!\d)/;

  // "Vectra 1.8 + LPG 2006r.", "Accord z 2006 roku" - but not "kupiony w 2019 roku"
  // or "ubezpieczenie do 5 maja 2027 roku".
  const YEAR_SUFFIXED = /(?<![\d.,])((?:19|20)\d{2})\s?(?:r\b\.?|rok(?:u|iem)?\b|rocznik\b)/g;
  // Words that mean the year belongs to an event, not to the car.
  const EVENT_BEFORE_YEAR =
    /(?:kup\w+|sprowadz\w*|zarejestrow\w*|rejestracj\w*|wymien\w*|przeglad\w*|oc\s+(?:w|na)\s*|od|do|styczn\w*|lut\w*|mar\w*|kwietn\w*|maja|czerwc\w*|lipc\w*|sierpn\w*|wrzesi\w*|pazdziernik\w*|listopad\w*|grudn\w*)\s*(?:w|we)?\s*$/;
  const EVENT_AFTER_YEAR = /^\s*(?:roku\s+)?(?:wymienion\w*|kupion\w*|serwisowan\w*|napraw\w*|przeglad\w*|zakupion\w*|oddan\w*)\b/;

  function isEventYear(text, index, end) {
    const before = clauseBefore(text, index, 40);
    if (EVENT_BEFORE_YEAR.test(before)) return true;
    return EVENT_AFTER_YEAR.test(clauseAfter(text, end, 25));
  }

  function yearFromText(text) {
    const t = normalize(text);
    const m = YEAR_LABELED.exec(t);
    if (m) {
      const y = +(m[1] || m[2]);
      return plausibleYear(y) ? y : null;
    }
    for (const s of t.matchAll(YEAR_SUFFIXED)) {
      if (isEventYear(t, s.index, s.index + s[0].length)) continue;
      if (plausibleYear(+s[1])) return +s[1];
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Mileage
  // ---------------------------------------------------------------------------

  function toKm(value, unit) {
    if (!Number.isFinite(value)) return null;
    return Math.round(/^mil/.test(unit || '') ? value * 1.609344 : value);
  }

  // A card line that is only the mileage: "187 tys. km", "187K km", "120 000 km".
  const MILEAGE_LINE = /^\s*\d[\d\s.,]*\s*(?:tys\.?|k|mln)?\s*(?:km|mil\w*)\b/;

  function parseMileage(text) {
    const t = normalize(text);
    let m = /(\d+(?:[.,]\d+)?)\s*(tys\.?|k\b|mln)\s*(km|mil\w*)?/.exec(t);
    if (m) {
      const mult = m[2] === 'mln' ? 1e6 : 1000;
      return toKm(parseFloat(m[1].replace(',', '.')) * mult, m[3]);
    }
    m = /(\d{1,3}(?:[ .,]\d{3})+|\d+)\s*(km|mil\w*)\b/.exec(t);
    if (m) return toKm(parseInt(m[1].replace(/[ .,]/g, ''), 10), m[2]);
    return null;
  }

  const MILEAGE_LABELED = /\bprzebieg\w*\s*[:\-–]?\s*(?:ok\.?\s*|okolo\s*|tylko\s*|ok\s+)?(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(tys\.?|tys\b|k\b)?\s*(km|mil\w*)?/;

  // The number before the word: "345.000 przebiegu", "180 tys. km przebiegu".
  const MILEAGE_BEFORE_LABEL = /(?<![\d.,])(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(tys\.?|tys\b|k\b)?\s*(km|mil\w*)?\s*(?:realnego\s+|udokumentowanego\s+|oryginalnego\s+)?przebieg\w*/;

  function mileageFromText(text) {
    const t = normalize(text);
    const m = MILEAGE_LABELED.exec(t) || MILEAGE_BEFORE_LABEL.exec(t);
    if (!m) return null;
    let value;
    if (/[ .]\d{3}$/.test(m[1])) value = parseInt(m[1].replace(/[ .]/g, ''), 10);
    else value = parseFloat(m[1].replace(',', '.'));
    // "przebieg 180 tys." or a bare "przebieg 180" (nobody sells a used car with 180 km).
    if (m[2] || value < 2000) value *= 1000;
    return toKm(value, m[3]);
  }

  // ---------------------------------------------------------------------------
  // Listing card (search results)
  // ---------------------------------------------------------------------------

  const PRICE_LINE = /\d[\d\s.,]*\s*(?:zl|pln|eur|usd|gbp)\b|\d[\d\s.,]*\s*[$€£]|[$€£]\s*\d|\b(?:zl|pln|eur)\s*\d|^(?:bezplatnie|za darmo|free)$/;

  // Labels Facebook puts on the card instead of the title.
  const CARD_META_LINE = /^(?:zamieszczone|ogloszenie partnera|just posted|partner ad|promowane|wyroznione|reklama|ad)\b/i;

  const CURRENCY = '(?:zł|zl|pln|eur|usd|gbp|huf|ron|hrk|sek|nok|chf|czk|ft|hufr|forint)';
  // No \b here: it does not work after a Polish letter ("zł") in JavaScript.
  const CURRENCY_TOKEN = new RegExp('[\\d\\s.,]*\\s*(?:' + CURRENCY + ')(?![a-z0-9])', 'gi');

  const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // The link's aria-label is "<title>, <price>, <location>, ogłoszenie <id>".
  // The title is the only reliable one: on the card it is sometimes replaced
  // by a label or not rendered at all. The price is the last field with a
  // currency, so everything from it on is dropped.
  function titleFromAria(aria, price, location) {
    let s = String(aria || '').replace(/,\s*ogłoszenie\s+\d+\s*$/i, '').trim();
    if (!s) return null;
    let last = null;
    let m;
    CURRENCY_TOKEN.lastIndex = 0;
    while ((m = CURRENCY_TOKEN.exec(s))) last = m;
    if (last) {
      s = s.slice(0, last.index).replace(/[\s,]+$/, '');
    } else {
      const loc = flat(location);
      const prc = flat(price);
      if (loc && flat(s).endsWith(loc)) s = flat(s).slice(0, flat(s).length - loc.length).replace(/,\s*$/, '').trim();
      if (prc && flat(s).endsWith(prc)) s = flat(s).slice(0, flat(s).length - prc.length).replace(/,\s*$/, '').trim();
    }
    s = s.replace(/^[\s,]+/, '').replace(/,\s*$/, '').trim();
    return s || null;
  }

  function parseCardText(text, ariaLabel) {
    const lines = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    let mileageKm = null;
    let price = null;
    const rest = [];
    for (const line of lines) {
      const n = normalize(line);
      if (MILEAGE_LINE.test(n)) {
        if (mileageKm == null) mileageKm = parseMileage(n);
        continue;
      }
      if (PRICE_LINE.test(n)) {
        if (price == null) price = line;
        continue;
      }
      if (CARD_META_LINE.test(n)) continue;
      rest.push(line);
    }
    // The card ends with the location, so the title is the line before it.
    const location = rest.length ? rest[rest.length - 1] : null;
    let title = titleFromAria(ariaLabel, price, location);
    if (!title && rest.length >= 2) title = rest[rest.length - 2];
    let year = null;
    for (const line of rest) {
      year = yearFromTitle(line);
      if (year) break;
    }
    const joined = rest.join('\n');
    return {
      title,
      year,
      mileageKm,
      fuels: joined ? detectFuels(joined) : null,
      transmission: joined ? detectTransmission(joined) : null,
      text: lines.join(' | '),
    };
  }

  // ---------------------------------------------------------------------------
  // Listing page (/marketplace/item/<id>/) HTML
  // ---------------------------------------------------------------------------

  function decodeJsonString(s) {
    try {
      return JSON.parse('"' + s + '"');
    } catch (e) {
      return s;
    }
  }

  const NAMED_ENTITIES = { oacute: 'ó', Oacute: 'Ó' };

  function decodeHtmlEntities(s) {
    return String(s)
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&([a-z]+);/gi, (all, name) => NAMED_ENTITIES[name] || all)
      .replace(/&amp;/g, '&');
  }

  const JSON_STR = '"((?:[^"\\\\]|\\\\.)*)"';

  function jsonStringField(html, key) {
    const m = new RegExp('"' + key + '":' + JSON_STR).exec(html);
    return m ? decodeJsonString(m[1]) : null;
  }

  function metaContent(html, name) {
    const re = new RegExp('<meta[^>]+(?:property|name)="' + name + '"[^>]*content="([^"]*)"', 'i');
    const reversed = new RegExp('<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="' + name + '"', 'i');
    const m = re.exec(html) || reversed.exec(html);
    return m ? decodeHtmlEntities(m[1]) : null;
  }

  // Facebook embeds the listing in the page as Relay JSON. The first
  // occurrence of each field belongs to the listing itself.
  function parseItemHtml(html) {
    html = String(html || '');
    const out = {
      title: jsonStringField(html, 'marketplace_listing_title'),
      description: null,
      fbFuel: jsonStringField(html, 'vehicle_fuel_type'),
      fbTransmission: jsonStringField(html, 'vehicle_transmission_type'),
      odometer: null,
    };

    const desc = new RegExp('"redacted_description":\\{[^{}]*?"text":' + JSON_STR).exec(html);
    if (desc) out.description = decodeJsonString(desc[1]);

    const odo = /"vehicle_odometer_data":(\{[^{}]*\})/.exec(html);
    if (odo) {
      try {
        out.odometer = JSON.parse(odo[1]);
      } catch (e) {
        /* ignore malformed */
      }
    }

    if (!out.title) out.title = metaContent(html, 'og:title');
    if (!out.description) out.description = metaContent(html, 'og:description') || metaContent(html, 'description');
    return out;
  }

  function odometerKm(odo) {
    if (!odo || odo.value == null) return null;
    const value = Number(odo.value);
    if (!Number.isFinite(value) || value <= 0) return null;
    return toKm(value, /MILE/i.test(odo.unit || '') ? 'mil' : 'km');
  }

  // Turns parseItemHtml() output into listing info.
  function analyzeDetails(d) {
    const text = [d.title, d.description].filter(Boolean).join('\n');

    let fuels = mapFacebookFuel(d.fbFuel);
    const textFuels = detectFuels(text);
    if (fuels) {
      // Facebook has no LPG option, so gas installations live in the description.
      if (textFuels && textFuels.includes('lpg') && !fuels.includes('lpg')) fuels = fuels.concat('lpg');
    } else {
      fuels = textFuels;
      if (fuels && fuels.includes('diesel') && fuels.includes('petrol')) {
        // Both are mentioned: the title ("2.2 i-CTDi") decides.
        const titleFuels = detectFuels(d.title || '') || [];
        const titleDiesel = titleFuels.includes('diesel');
        const titlePetrol = titleFuels.includes('petrol');
        if (titleDiesel !== titlePetrol) {
          const keep = titleDiesel ? 'diesel' : 'petrol';
          fuels = fuels.filter((f) => f === keep || (f !== 'diesel' && f !== 'petrol'));
        }
      }
    }

    return {
      title: d.title || null,
      year: (d.title && yearFromTitle(d.title)) || yearFromText(d.description) || null,
      fuels,
      transmission: mapFacebookTransmission(d.fbTransmission) || detectTransmission(text),
      mileageKm: odometerKm(d.odometer) || mileageFromText(d.description),
      // What Facebook itself shows - kept for the diagnostics log.
      raw: {
        fuel: d.fbFuel || null,
        transmission: d.fbTransmission || null,
        odometer: odometerKm(d.odometer),
        description: d.description ? String(d.description).slice(0, 400) : null,
      },
    };
  }

  // Card data is what the user sees, so it wins for year/mileage; the listing
  // page has structured data, so it wins for fuel/transmission. The title
  // comes from the listing page - on the card it is sometimes replaced by
  // a label ("Zamieszczone przed chwilą") or missing altogether.
  function mergeInfo(card, details) {
    card = card || {};
    details = details || {};
    const pick = (a, b) => (a != null ? a : b != null ? b : null);
    return {
      title: pick(details.title, card.title),
      year: pick(card.year, details.year),
      mileageKm: pick(card.mileageKm, details.mileageKm),
      fuels: pick(details.fuels, card.fuels),
      transmission: pick(details.transmission, card.transmission),
    };
  }

  // ---------------------------------------------------------------------------
  // Listings that are not a car: parts, accessories and "wanted" ads.
  // Only ever used when the user switches on "Ukrywaj części i akcesoria",
  // so prefer missing a few parts over hiding a real car.
  // ---------------------------------------------------------------------------

  // A title that starts or ends with a part name is almost never a car.
  // Wheels/tyres and body parts are safe as title markers; single part words in
  // a description may also just describe a whole car ("dorzucę komplet opon",
  // "nowe hamulce"), so the description layer only gets strict part-ad wording.
  // Checked at the start of every title line ("Honda Accord\nKoła, Kołpaki…"),
  // also after "Sprzedam", "Tytuł:", "Oryginalne". Not after "Nowy/Nowe" -
  // "Nowy rozrząd, Honda Civic" is a car.
  const PART_WORDS = [
    'felg\\w*', 'alufelg\\w*', 'kol\\w*', 'opon\\w*', 'komplet\\b', 'stalowk\\w*', 'stalki\\b',
    'rozrzad\\w*', 'lamp\\w*', 'swiatl\\w*', 'drzwi\\b', 'mask\\w*', 'zderzak\\w*', 'blotnik\\w*',
    'klap\\w*', 'lusterk\\w*', 'lustro\\b', 'kierownic\\w*', 'katalizator\\w*', 'wydech\\w*',
    'turbina\\b', 'turbosprez\\w*', 'amortyzat\\w*', 'sprezyn\\w*', 'wahacz\\w*', 'wtrysk\\w*',
    'pomp\\w*', 'klocki\\b', 'tarcz\\w*', 'hamulc\\w*', 'hak\\w*', 'dywanik\\w*', 'pokrowc\\w*',
    'oslon\\w*', 'podsufitk\\w*', 'alternator\\w*', 'rozrusznik\\w*', 'dwumas\\w*', 'silnik\\w*',
    'skrzynia\\s+biegow\\b', 'czesci\\b', 'radio\\w*', 'lotk[ai]\\b', 'spojler\\w*', 'dojazdowk\\w*',
    'plastikow\\w*', 'nakladk\\w*', 'listw\\w*', 'uszczelk\\w*', 'czujnik\\w*', 'sterownik\\w*',
    'nawigacj\\w*', 'glosnik\\w*', 'fotel\\w*', 'szyb[ay]\\b',
  ];
  const PARTS_TITLE_START = new RegExp(
    '^(?:zamieszczone\\s+\\S+\\s+|\\d+\\s*x\\s*\\d+\\s*)?' +
      '(?:(?:sprzedam|tytul:?|oryginaln\\w*|orginaln\\w*)\\s+){0,2}' +
      '(?:' + PART_WORDS.join('|') + ')',
    'm'
  );
  const PARTS_TITLE_END = new RegExp(
    '\\b(?:czesci|akcesoria|felgi|alufelgi|kola|kolo|kolach|opony|opona|lampy|lampy przednie|lamki|maska|zderzak|zderzaki|klapa|klapka|blotnik|blotniki|lusterka|lusterko|silnik|skrzynia biegow|katalizator|turbina|alternator|rozrusznik|dywaniki|hamulce|rozrzad)\\s*$'
  );

  // Unambiguous phrases; single part words in a description may also describe
  // a whole car ("dorzucę komplet opon", "nowe hamulce"), so only strict
  // "this is a parts ad" wording counts. "do części" / "części do" are left out
  // on purpose - car ads say "łatwy dostęp do części", "tanie części do tego
  // modelu" - and "na części" is skipped when negated ("nie na części").
  const PARTS_PHRASE = /(?:(?<!\bnie\s)(?<!\bnie\s+jest\s)\bna\s+czesci\b|\bsprzedam\s+czesci\b|\bczesci\s+zapraszam\b|\bdo\s+rozbierania\b|\btylko\s+czesci\b)/i;
  const WANTED_TITLE = /^(?:kupie|zakupie|poszuku?j\w*|szukam\w*)\b/;

  // Returns { type: 'parts' | 'wanted', match: string } or null.
  function detectNotCar(title, text) {
    const t = normalize(title);
    if (!WANTED_TITLE.test(t)) {
      const started = PARTS_TITLE_START.exec(t);
      if (started) return { type: 'parts', match: started[0].trim() };
      const ended = PARTS_TITLE_END.exec(t);
      if (ended) return { type: 'parts', match: ended[0].trim() };
    }
    const m = PARTS_PHRASE.exec(normalize(text));
    if (m) return { type: 'parts', match: m[0].trim() };
    if (WANTED_TITLE.test(t)) return { type: 'wanted', match: t.split(/\s+/)[0] };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  function toIntOrNull(v) {
    if (v === '' || v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function normalizeSettings(raw) {
    const s = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    s.enabled = s.enabled !== false;
    s.yearMin = toIntOrNull(s.yearMin);
    s.yearMax = toIntOrNull(s.yearMax);
    s.mileageMax = toIntOrNull(s.mileageMax);
    s.fuels = Array.isArray(s.fuels) ? s.fuels.filter((f) => FUELS.includes(f)) : [];
    s.transmissions = Array.isArray(s.transmissions) ? s.transmissions.filter((t) => TRANSMISSIONS.includes(t)) : [];
    s.unknownMode = s.unknownMode === 'hide' ? 'hide' : 'show';
    s.rejectMode = s.rejectMode === 'dim' ? 'dim' : 'hide';
    s.partsHide = s.partsHide === true;
    s.fetchDetails = s.fetchDetails !== false;
    s.showBadges = s.showBadges !== false;
    s.debugLog = s.debugLog === true;
    return s;
  }

  function activeFilters(settings) {
    const s = normalizeSettings(settings);
    return {
      year: s.yearMin != null || s.yearMax != null,
      fuel: s.fuels.length > 0 && s.fuels.length < FUELS.length,
      transmission: s.transmissions.length === 1,
      mileage: s.mileageMax != null,
    };
  }

  // Returns { verdict: 'match' | 'reject' | 'unknown', failed: [...], missing: [...] }
  // where failed/missing list the fields ('year', 'fuel', 'transmission', 'mileage').
  function evaluate(info, settings) {
    const s = normalizeSettings(settings);
    const active = activeFilters(s);
    info = info || {};
    const failed = [];
    const missing = [];

    if (active.year) {
      if (info.year == null) missing.push('year');
      else if ((s.yearMin != null && info.year < s.yearMin) || (s.yearMax != null && info.year > s.yearMax)) failed.push('year');
    }
    if (active.fuel) {
      if (!info.fuels || !info.fuels.length) missing.push('fuel');
      else if (!info.fuels.some((f) => s.fuels.includes(f))) failed.push('fuel');
    }
    if (active.transmission) {
      if (!info.transmission) missing.push('transmission');
      else if (!s.transmissions.includes(info.transmission)) failed.push('transmission');
    }
    if (active.mileage) {
      if (info.mileageKm == null) missing.push('mileage');
      else if (info.mileageKm > s.mileageMax) failed.push('mileage');
    }

    const verdict = failed.length ? 'reject' : missing.length ? 'unknown' : 'match';
    return { verdict, failed, missing };
  }

  // Human-readable reasons for a verdict: why a listing was rejected and
  // which data could not be found. Used by the diagnostics log.
  function explain(info, settings) {
    const s = normalizeSettings(settings);
    const active = activeFilters(s);
    info = info || {};
    const rejected = [];
    const missing = [];
    const wanted = s.fuels.map((f) => FUEL_LABELS[f]).join(', ');

    if (active.year) {
      if (info.year == null) missing.push('rok');
      else {
        if (s.yearMin != null && info.year < s.yearMin) rejected.push(`rok ${info.year} < ${s.yearMin}`);
        if (s.yearMax != null && info.year > s.yearMax) rejected.push(`rok ${info.year} > ${s.yearMax}`);
      }
    }
    if (active.fuel) {
      if (!info.fuels || !info.fuels.length) missing.push('paliwo');
      else if (!info.fuels.some((f) => s.fuels.includes(f))) {
        rejected.push(`paliwo: ${info.fuels.map((f) => FUEL_LABELS[f]).join(' + ')} (wybrano: ${wanted})`);
      }
    }
    if (active.transmission) {
      if (!info.transmission) missing.push('skrzynia');
      else if (!s.transmissions.includes(info.transmission)) {
        rejected.push(`skrzynia: ${TRANSMISSION_LABELS[info.transmission]} (wybrano: ${s.transmissions.map((t) => TRANSMISSION_LABELS[t]).join(', ')})`);
      }
    }
    if (active.mileage) {
      if (info.mileageKm == null) missing.push('przebieg');
      else if (info.mileageKm > s.mileageMax) rejected.push(`przebieg ${formatMileage(info.mileageKm)} > ${formatMileage(s.mileageMax)}`);
    }
    return { rejected, missing };
  }

  // Human-readable summary of a diagnostics record: what Facebook shows,
  // what the extension concluded and what the verdict was.
  const VERDICT_LABELS = {
    match: 'PASUJE',
    reject: 'ODRZUCONE',
    unknown: 'BEZ DANYCH',
    'reject-unknown': 'ODRZUCONE (brak danych)',
    notcar: 'TO NIE JEST AUTO',
    pending: 'SPRAWDZAM OPIS…',
    off: 'FILTR WYŁĄCZONY',
  };

  function fbSummary(rec) {
    const parts = [];
    if (rec.fb.fuel) parts.push('paliwo ' + rec.fb.fuel);
    if (rec.fb.transmission) parts.push('skrzynia ' + rec.fb.transmission);
    if (rec.fb.odometer != null) parts.push('przebieg ' + formatMileage(rec.fb.odometer));
    return parts.join(' · ') || 'brak danych w polach pojazdu';
  }

  function parsedSummary(rec) {
    const parts = [];
    if (rec.parsed.year != null) parts.push(String(rec.parsed.year));
    if (rec.parsed.fuels && rec.parsed.fuels.length) parts.push(rec.parsed.fuels.map((f) => FUEL_LABELS[f]).join(' + '));
    if (rec.parsed.transmission) parts.push(TRANSMISSION_LABELS[rec.parsed.transmission]);
    if (rec.parsed.mileageKm != null) parts.push(formatMileage(rec.parsed.mileageKm));
    return parts.join(' · ') || 'brak danych';
  }

  function verdictText(rec) {
    const label = VERDICT_LABELS[rec.state] || rec.state;
    if (rec.reasons && rec.reasons.length) return `${label} – ${rec.reasons.join('; ')}`;
    if (rec.missing && rec.missing.length) return `${label} – brak: ${rec.missing.join(', ')}`;
    return label;
  }

  function diagnosticsText(records) {
    return (records || [])
      .map(
        (rec) =>
          [
            rec.title,
            '  FB pokazuje:  ' + fbSummary(rec),
            '  Karta:        ' + (rec.card.text ? rec.card.text : '(brak)'),
            '  Opis:         ' + (rec.fb.description ? rec.fb.description.replace(/\s+/g, ' ').slice(0, 200) : '(brak)'),
            '  Rozszerzenie: ' + parsedSummary(rec),
            '  Werdykt:      ' + verdictText(rec),
          ].join('\n')
      )
      .join('\n\n');
  }

  function extractItemId(href) {
    const m = /\/marketplace\/item\/(\d+)/.exec(href || '');
    return m ? m[1] : null;
  }

  function formatMileage(km) {
    if (km == null) return '';
    if (km >= 1000) return Math.round(km / 1000) + ' tys. km';
    return km + ' km';
  }

  const api = {
    PARSER_VERSION,
    FUELS,
    TRANSMISSIONS,
    FUEL_LABELS,
    TRANSMISSION_LABELS,
    DEFAULT_SETTINGS,
    normalize,
    detectFuels,
    detectTransmission,
    mapFacebookFuel,
    mapFacebookTransmission,
    yearFromTitle,
    yearFromText,
    parseMileage,
    mileageFromText,
    parseCardText,
    parseItemHtml,
    analyzeDetails,
    mergeInfo,
    detectNotCar,
    normalizeSettings,
    activeFilters,
    evaluate,
    explain,
    fbSummary,
    parsedSummary,
    verdictText,
    diagnosticsText,
    extractItemId,
    formatMileage,
    maxYear,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FMF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
