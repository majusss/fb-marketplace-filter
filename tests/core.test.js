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
  assert.deepEqual(FMF.detectFuels('Ford Focus B+G'), ['lpg']);
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
});

test('mileage parsing', () => {
  assert.equal(FMF.parseMileage('187 tys. km'), 187000);
  assert.equal(FMF.parseMileage('187K km'), 187000);
  assert.equal(FMF.parseMileage('120 000 km'), 120000);
  assert.equal(FMF.parseMileage('100K mil'), 160934);
  assert.equal(FMF.mileageFromText('Przebieg: 215 000 km'), 215000);
  assert.equal(FMF.mileageFromText('przebieg 180 tys'), 180000);
  assert.equal(FMF.mileageFromText('Przebieg ok. 95000km'), 95000);
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
  });
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
