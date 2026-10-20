'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const FMF = require('../src/core.js');

test('fuel: explicit words and engine codes', () => {
  assert.deepEqual(FMF.detectFuels('Volkswagen Passat B6 2.0 TDI 140KM'), ['diesel']);
  assert.deepEqual(FMF.detectFuels('BMW 320d E90'), ['diesel']);
  assert.deepEqual(FMF.detectFuels('Mercedes C220d'), ['diesel']);
  assert.deepEqual(FMF.detectFuels('Skoda Octavia 1.4 TSI'), ['petrol']);
  assert.deepEqual(FMF.detectFuels('Toyota Yaris benzyna, mały przebieg'), ['petrol']);
  assert.deepEqual(FMF.detectFuels('Opel Astra 1.6 benzyna + LPG'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('Ford Focus B+G'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('Opel Vectra C OPC Line 1.8 + LPG 2006r.'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('Passat 1.9 TDI + LPG'), ['diesel', 'lpg']);
  assert.deepEqual(
    FMF.detectFuels('Sprzedam Honde Accord 2.0 GAZ, nowe hamulce, butla gazu na 8 lat, dwa komplety opon. Wspomaganie kierownicy, el. szyby'),
    ['petrol', 'lpg']
  );
  assert.deepEqual(FMF.detectFuels('Benzyna, legalizacja butli do 2030'), ['petrol', 'lpg']);
  assert.equal(FMF.detectFuels('Wymieniony pedał gazu i linka'), null);
  assert.equal(FMF.detectFuels('Przycisk gazu nie działa'), null);
  assert.equal(FMF.detectFuels('Sprężyny gazowe w zawieszeniu'), null);
  assert.deepEqual(
    FMF.detectFuels('Sprzedam Hondę Accord z 2007r. o pojemności 2.0 benzyna z sekwencyjnym gazem ważnym do 2031r.'),
    ['petrol', 'lpg']
  );
  assert.deepEqual(FMF.detectFuels('Samochód na gazie, butla gazu'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('serwis gazu (filtry, przegląd), Gaz jest do 6 grudnia 2033 roku'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('motor 2.2 i-DTEC 150 CP'), ['diesel']);
  assert.deepEqual(FMF.detectFuels('silnik 2.0 i-VTEC benzyna'), ['petrol']);
  assert.deepEqual(FMF.detectFuels('układ gazowy w aucie, gaz ważny do 2031'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('Auto ma gaz.'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('Toyota Auris Hybrid'), ['hybrid']);
  assert.deepEqual(FMF.detectFuels('Nissan Leaf, samochód w pełni elektryczny'), ['electric']);
  assert.deepEqual(FMF.detectFuels('Fiat Punto, zamienię na diesla'), null);
});

test('fuel: labeled values win', () => {
  assert.deepEqual(FMF.detectFuels('Rodzaj paliwa: Diesel\nSkrzynia biegów: Manualna'), ['diesel']);
  assert.deepEqual(FMF.detectFuels('Paliwo: ON'), ['diesel']);
  assert.deepEqual(FMF.detectFuels('Paliwo - benzyna/gaz'), ['petrol', 'lpg']);
  assert.deepEqual(FMF.detectFuels('Silnik: 1.9 TDI'), ['diesel']);
  assert.deepEqual(FMF.detectFuels('Paliwo: benzyna. Instalacja gazowa BRC założona 2 lata temu'), ['petrol', 'lpg']);
});

test('fuel: no false positives from equipment lists', () => {
  const ad = 'Wyposażenie: elektryczne szyby, elektrycznie sterowane lusterka, ' +
    'amortyzatory gazowe klapy, klimatyzacja automatyczna. Silnik 1.6 benzyna.';
  assert.deepEqual(FMF.detectFuels(ad), ['petrol']);
  assert.deepEqual(FMF.detectFuels('Auto bez LPG, benzyna'), ['petrol']);
  assert.deepEqual(FMF.detectFuels('Nigdy nie miał gazu. Benzyna'), ['petrol']);
  assert.equal(FMF.detectFuels('Ładny kolor, zadbany'), null);
});

test('transmission: gearbox phrases', () => {
  assert.equal(FMF.detectTransmission('Skrzynia biegów: Automatyczna'), 'automatic');
  assert.equal(FMF.detectTransmission('skrzynia biegów manualna, 6 biegów'), 'manual');
  assert.equal(FMF.detectTransmission('Golf 1.4 TSI DSG'), 'automatic');
  assert.equal(FMF.detectTransmission('Audi A6 3.0 TDI Quattro S-tronic'), 'automatic');
  assert.equal(FMF.detectTransmission('Toyota Corolla 1.6 Automat'), 'automatic');
  assert.equal(FMF.detectTransmission('Ręczna skrzynia biegów w idealnym stanie'), 'manual');
  assert.equal(FMF.detectTransmission('Skrzynia 6-biegowa'), 'manual');
  assert.equal(FMF.detectTransmission('sekwencyjna skrzynia biegów'), 'automatic');
  assert.equal(FMF.detectTransmission('sekwencyjna skrzynia gazowa'), null);
  assert.equal(FMF.detectTransmission('Skrzynia biegów 6-biegowa automatyczna'), 'automatic');
  assert.equal(FMF.detectTransmission('Skrzynia biegow reczna'), 'manual');
});

test('transmission: ignores automatic air-con and similar', () => {
  assert.equal(FMF.detectTransmission('Klimatyzacja automatyczna, automatyczne światła, klima automat'), null);
  assert.equal(FMF.detectTransmission('Klimatyzacja manualna, manualna regulacja foteli'), null);
  assert.equal(
    FMF.detectTransmission('Skrzynia manualna, klimatyzacja automatyczna dwustrefowa, automatyczne wycieraczki'),
    'manual'
  );
  assert.equal(FMF.detectTransmission('Skrzynia biegów: manualna, klimatyzacja: automatyczna'), 'manual');
  assert.equal(FMF.detectTransmission('Nie ma automatu, zamienię na automat'), null);
});

test('year from titles and text', () => {
  assert.equal(FMF.yearFromTitle('2015 Volkswagen Golf'), 2015);
  assert.equal(FMF.yearFromTitle('Audi A4 B8 2.0 TDI 2009r'), 2009);
  assert.equal(FMF.yearFromTitle('Opel Astra 1998 cm3'), null);
  assert.equal(FMF.yearFromTitle('BMW 320d'), null);
  assert.equal(FMF.yearFromTitle('Passat 2.0'), null);
  assert.equal(FMF.yearFromText('Rok produkcji: 2012, przebieg 180 tys'), 2012);
  assert.equal(FMF.yearFromText('Rocznik 2008'), 2008);
  assert.equal(FMF.yearFromText('W 2020 roku wymieniony rozrząd'), null);
  assert.equal(FMF.yearFromText('Sprzedam swoje prywatne auto.\nOpel Vectra C OPC Line 1.8 + LPG 2006r.'), 2006);
  assert.equal(FMF.yearFromText('Golf 2011 rok, zadbany'), 2011);
  assert.equal(FMF.yearFromText('Auto kupione w 2019r. w salonie'), null);
  assert.equal(FMF.yearFromText('Posiadam od 2018 r.'), null);
  assert.equal(FMF.yearFromText('Sprzedam Hondę Accord z 2007r. o pojemności 2.0'), 2007);
  assert.equal(FMF.yearFromText('Mam na sprzedaż Hondę Accord z 2006 roku w wersji sedan'), 2006);
  assert.equal(FMF.yearFromText('Ubezpieczenie jest do 5 maja 2027 roku. Przegląd do 9 lutego 2027 roku'), null);
});

test('mileage parsing', () => {
  assert.equal(FMF.parseMileage('187 tys. km'), 187000);
  assert.equal(FMF.parseMileage('187K km'), 187000);
  assert.equal(FMF.parseMileage('120 000 km'), 120000);
  assert.equal(FMF.parseMileage('100K mil'), 160934);
  assert.equal(FMF.mileageFromText('Przebieg: 215 000 km'), 215000);
  assert.equal(FMF.mileageFromText('przebieg 180 tys'), 180000);
  assert.equal(FMF.mileageFromText('Przebieg ok. 95000km'), 95000);
  assert.equal(FMF.mileageFromText('6 biegowa skrzynia biegów, 156km, 345.000 przebiegu, radio'), 345000);
  assert.equal(FMF.mileageFromText('Ma 180 tys. km przebiegu'), 180000);
});

test('card text parsing', () => {
  const card = FMF.parseCardText('25 900 zł\n27 000 zł\n2012 Volkswagen Passat 2.0 TDI\nKraków, MA\n187 tys. km');
  assert.equal(card.title, '2012 Volkswagen Passat 2.0 TDI');
  assert.equal(card.year, 2012);
  assert.equal(card.mileageKm, 187000);
  assert.deepEqual(card.fuels, ['diesel']);
  assert.equal(card.transmission, null);

  const priceLikeYear = FMF.parseCardText('2000 zł\nOpel Corsa\nWarszawa');
  assert.equal(priceLikeYear.year, null);

  const hp = FMF.parseCardText('15 000 zł\nAudi A4 1.9 TDI 130 KM automat\nŁódź');
  assert.equal(hp.mileageKm, null);
  assert.equal(hp.transmission, 'automatic');
});

test('card text parsing: labels and missing titles', () => {
  // "Zamieszczone przed chwilą" and "Ogłoszenie partnera" are labels, not titles.
  const posted = FMF.parseCardText('Zamieszczone przed chwilą\n15 300 zł\n2004 Honda Accord\nDębica gmina');
  assert.equal(posted.title, '2004 Honda Accord');
  assert.equal(posted.year, 2004);

  const partner = FMF.parseCardText('Ogłoszenie partnera\n5 000 zł\n2016 Volkswagen Golf\nKraków');
  assert.equal(partner.title, '2016 Volkswagen Golf');
  assert.equal(partner.year, 2016);

  // Only a price and a location - the title is not on the card at all.
  const noTitle = FMF.parseCardText('65 000 zł\nLublin');
  assert.equal(noTitle.title, null);
  assert.equal(noTitle.year, null);
  assert.equal(noTitle.text, '65 000 zł | Lublin');
});

test('card text parsing: the title comes from the aria-label', () => {
  // Facebook's link label: "<title>, <price>, <location>, ogłoszenie <id>".
  const withAria = FMF.parseCardText(
    '11 900 zł\n2005 Honda Accord\nKraków',
    '2005 Honda Accord, 11 900 zł, Kraków, ogłoszenie 936520162203892'
  );
  assert.equal(withAria.title, '2005 Honda Accord');
  assert.equal(withAria.year, 2005);

  // Two prices on the card, one in the label.
  const partner = FMF.parseCardText(
    '49,90 zł\n59,90 zł\nResorak Majorette Honda Accord 1:59 kolekcjonerski metalowy',
    'Resorak Majorette Honda Accord 1:59 kolekcjonerski metalowy, 49,90 zł, Kraków, ogłoszenie 28864662319817262'
  );
  assert.equal(partner.title, 'Resorak Majorette Honda Accord 1:59 kolekcjonerski metalowy');

  // A label without a title (Facebook renders it later) stays empty.
  const noTitle = FMF.parseCardText('65 000 zł\nLublin', ', 65 000 zł, Lublin, ogłoszenie 1072544729036537');
  assert.equal(noTitle.title, null);
});

test('listing page HTML parsing (Relay JSON)', () => {
  const html =
    '<html><head><meta property="og:title" content="ignored"></head><body><script type="application/json">' +
    JSON.stringify({
      target: {
        marketplace_listing_title: '2016 Škoda Octavia',
        redacted_description: { text: 'Auto zadbane.\nInstalacja LPG, rocznik 2016.' },
        vehicle_fuel_type: 'GASOLINE',
        vehicle_transmission_type: 'MANUAL',
        vehicle_odometer_data: { unit: 'KILOMETERS', value: 201000 },
      },
    }) +
    '</script></body></html>';
  const parsed = FMF.parseItemHtml(html);
  assert.equal(parsed.title, '2016 Škoda Octavia');
  assert.equal(parsed.fbFuel, 'GASOLINE');
  const info = FMF.analyzeDetails(parsed);
  assert.deepEqual(info, {
    title: '2016 Škoda Octavia',
    year: 2016,
    fuels: ['petrol', 'lpg'],
    transmission: 'manual',
    mileageKm: 201000,
    raw: {
      fuel: 'GASOLINE',
      transmission: 'MANUAL',
      odometer: 201000,
      description: 'Auto zadbane.\nInstalacja LPG, rocznik 2016.',
    },
  });
});

test('fuel: the title decides when the description mentions both', () => {
  const diesel = FMF.analyzeDetails({
    title: 'Honda Accord VII, 2.2 i-CTDi',
    description: 'Silnik 2.2 i-CTDi 150KM, auto zadbane, benzyna w aucie.',
    fbFuel: null,
  });
  assert.deepEqual(diesel.fuels, ['diesel']);

  const petrol = FMF.analyzeDetails({
    title: 'Honda Accord 2.0 benzyna',
    description: 'Silnik 2.0 benzyna, wersja z gazem.',
    fbFuel: null,
  });
  assert.deepEqual(petrol.fuels, ['petrol', 'lpg']);
});

test('diagnostics: explains why a listing was rejected', () => {  const settings = FMF.normalizeSettings({
    yearMin: 2005,
    fuels: ['petrol', 'lpg'],
    transmissions: ['manual'],
    mileageMax: 250000,
  });
  const info = {
    year: 2004,
    fuels: ['diesel'],
    transmission: 'automatic',
    mileageKm: 300000,
  };
  const { rejected, missing } = FMF.explain(info, settings);
  assert.deepEqual(rejected, [
    'rok 2004 < 2005',
    'paliwo: Diesel (wybrano: Benzyna, LPG/CNG)',
    'skrzynia: Automat (wybrano: Manualna)',
    'przebieg 300 tys. km > 250 tys. km',
  ]);
  assert.deepEqual(missing, []);

  const unknown = FMF.explain({ year: null, fuels: null, transmission: null, mileageKm: null }, settings);
  assert.deepEqual(unknown.missing, ['rok', 'paliwo', 'skrzynia', 'przebieg']);
});

test('listing page HTML parsing falls back to description text and meta tags', () => {
  const html =
    '<meta property="og:title" content="Renault Megane 1.5 dCi">' +
    '<meta property="og:description" content="Skrzynia bieg&oacute;w: automatyczna. Przebieg 160 tys. Rok produkcji: 2014">';
  const info = FMF.analyzeDetails(FMF.parseItemHtml(html));
  assert.equal(info.year, 2014);
  assert.deepEqual(info.fuels, ['diesel']);
  assert.equal(info.transmission, 'automatic');
  assert.equal(info.mileageKm, 160000);
});

test('JSON escapes in description are decoded', () => {
  const html = '"redacted_description":{"text":"Skrzynia bieg\\u00f3w: r\\u0119czna\\nPaliwo: Diesel"}';
  const parsed = FMF.parseItemHtml(html);
  assert.equal(parsed.description, 'Skrzynia biegów: ręczna\nPaliwo: Diesel');
  const info = FMF.analyzeDetails(parsed);
  assert.equal(info.transmission, 'manual');
  assert.deepEqual(info.fuels, ['diesel']);
});

test('evaluate: verdicts', () => {
  const settings = { yearMin: 2010, yearMax: 2018, fuels: ['diesel'], transmissions: ['automatic'] };
  assert.equal(FMF.evaluate({ year: 2015, fuels: ['diesel'], transmission: 'automatic' }, settings).verdict, 'match');
  assert.deepEqual(FMF.evaluate({ year: 2005, fuels: ['diesel'], transmission: 'automatic' }, settings).failed, ['year']);
  assert.deepEqual(FMF.evaluate({ year: 2015, fuels: ['petrol', 'lpg'], transmission: 'automatic' }, settings).failed, ['fuel']);
  const unknown = FMF.evaluate({ year: 2015, fuels: null, transmission: null }, settings);
  assert.equal(unknown.verdict, 'unknown');
  assert.deepEqual(unknown.missing, ['fuel', 'transmission']);
  // A definite failure wins over missing data.
  assert.equal(FMF.evaluate({ year: 2001 }, settings).verdict, 'reject');
  // Nothing selected / everything selected means no filter.
  assert.equal(FMF.evaluate({}, { fuels: FMF.FUELS, transmissions: ['manual', 'automatic'] }).verdict, 'match');
  assert.equal(FMF.evaluate({ mileageKm: 250000 }, { mileageMax: 200000 }).verdict, 'reject');
});

test('item id extraction', () => {
  assert.equal(FMF.extractItemId('/marketplace/item/1234567890123/?ref=search'), '1234567890123');
  assert.equal(FMF.extractItemId('https://www.facebook.com/marketplace/item/42/'), '42');
  assert.equal(FMF.extractItemId('/marketplace/category/vehicles'), null);
});
