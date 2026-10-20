# Filtr aut – Facebook Marketplace

Rozszerzenie do Chrome / Edge / Brave / Opery, które filtruje ogłoszenia samochodów
na Facebook Marketplace po:

- **roku produkcji** (od–do),
- **paliwie** (benzyna, diesel, LPG/CNG, hybryda, elektryczny),
- **skrzyni biegów** (manualna / automat),
- **przebiegu** (maksymalny, w km).

Działa także wtedy, gdy sprzedający nie wypełnił pól pojazdu, a informacje są tylko
w tytule albo w opisie ogłoszenia („2.0 TDI”, „skrzynia automatyczna”, „benzyna + LPG”,
„rocznik 2014” itd.).

## Instalacja

1. Pobierz kod: na GitHubie **Code → Download ZIP** i rozpakuj (albo `git clone`).
2. Otwórz w przeglądarce `chrome://extensions` (w Edge: `edge://extensions`).
3. Włącz **Tryb dewelopera** (przełącznik w prawym górnym rogu).
4. Kliknij **Załaduj rozpakowane** i wskaż rozpakowany folder (ten z plikiem `manifest.json`).
5. Przypnij ikonę rozszerzenia do paska (ikona puzzla → pinezka).

Jeśli Facebook był już otwarty – odśwież kartę.

## Jak używać

1. Wejdź na Facebook Marketplace i wyszukaj auta (np. kategoria **Pojazdy** albo
   wyszukiwanie „passat”).
2. Kliknij ikonę rozszerzenia i ustaw filtry. Zmiany działają od razu.
3. W lewym dolnym rogu strony widać licznik: ile ogłoszeń pasuje, ile ukryto,
   ile jest jeszcze sprawdzanych. Kliknięcie licznika włącza / wyłącza filtr.

Na zdjęciach ogłoszeń pojawiają się etykiety:

| Kolor     | Znaczenie                                          |
| --------- | -------------------------------------------------- |
| zielony   | wartość pasuje do filtra                           |
| czerwony  | wartość nie pasuje (widać przy „Przyciemniaj”)     |
| szary `?` | tej informacji nie udało się znaleźć w ogłoszeniu  |
| niebieski | rozszerzenie właśnie sprawdza opis ogłoszenia      |
| ciemny    | informacja, której nie filtrujesz                  |

### Opcje

- **Ogłoszenia bez tych danych** – co zrobić, gdy np. filtrujesz po skrzyni, a w ogłoszeniu
  nigdzie jej nie podano: pokazać (z etykietą „?”) albo ukryć.
- **Niepasujące ogłoszenia** – ukrywać całkowicie albo tylko przyciemniać
  (po najechaniu myszką widać je normalnie).
- **Sprawdzaj opisy ogłoszeń** – na liście wyników Facebook pokazuje tylko cenę, tytuł,
  miasto i przebieg. Paliwo i skrzynię zwykle widać dopiero w samym ogłoszeniu, więc
  rozszerzenie otwiera je w tle i czyta. Bez tej opcji filtr korzysta tylko z tytułu.
- **Wyczyść pamięć** – wyniki sprawdzania ogłoszeń są zapamiętywane na 7 dni, żeby nie
  pobierać ich ponownie; ten przycisk je usuwa.

## Jak to działa

1. Z karty ogłoszenia czytany jest tytuł (Facebook dla aut generuje go jako
   „2015 Volkswagen Golf”), przebieg i to, co widać w tytule (np. „1.9 TDI”, „Automat”, „DSG”).
   Jeśli to wystarcza do decyzji, nic więcej nie jest pobierane.
2. W przeciwnym razie rozszerzenie pobiera stronę ogłoszenia – tylko dla ogłoszeń widocznych
   na ekranie (lub tuż poniżej), maks. 2 naraz, z przerwami. Korzysta z pól pojazdu, które
   wypełnił sprzedający, a jeśli ich brak – z opisu.
3. Opis jest analizowany pod kątem polskich (i angielskich) sformułowań, np.
   „Rodzaj paliwa: Diesel”, „skrzynia biegów manualna”, „automat”, „S-tronic”, „320d”,
   „instalacja gazowa BRC”, „Rok produkcji: 2012”, „Przebieg: 180 tys.”.
   Typowe pułapki są pomijane: „klimatyzacja automatyczna”, „elektryczne szyby”,
   „amortyzatory gazowe”, „bez LPG”, „nie ma automatu”.

Wszystko dzieje się lokalnie w przeglądarce. Rozszerzenie nie wysyła nigdzie żadnych danych –
łączy się wyłącznie z facebook.com, tak samo jak przy ręcznym otwieraniu ogłoszeń.

## Ograniczenia

- Rozpoznawanie z opisu to heurystyka – przy nietypowo napisanych ogłoszeniach może się pomylić
  albo nic nie znaleźć (wtedy pojawia się „?”).
- Facebook co jakiś czas zmienia wygląd strony; jeśli filtr przestanie działać, zgłoś problem
  w Issues.
- Gdy Facebook zacznie ograniczać liczbę zapytań, sprawdzanie opisów wstrzymuje się
  na 3 minuty (informacja pojawia się w liczniku).
- Działa na `www.facebook.com` (i `web.facebook.com`) w przeglądarkach opartych na Chromium.
  Nie działa w aplikacji mobilnej ani na `m.facebook.com`.

## Dla programistów

```
src/core.js      – parsowanie i logika filtrów (bez DOM, testowane w Node)
src/content.js   – integracja ze stroną Marketplace
src/content.css  – ukrywanie / przyciemnianie, etykiety, licznik
popup/           – okno ustawień
tests/           – testy
```

```sh
npm test            # testy jednostkowe parsera (Node 18+)
npm install && npm run test:e2e   # test end-to-end w Chromium z atrapą strony Marketplace
```

Test end-to-end ładuje rozszerzenie do Chromium (Playwright) i podstawia sztuczne strony
`facebook.com`, więc nie potrzebuje konta ani internetu.
