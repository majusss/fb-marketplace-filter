<div align="center">

# Filtr aut – Facebook Marketplace

**Na Marketplace widzisz tylko auta z Twoim rocznikiem, paliwem, skrzynią i przebiegiem –
nawet jeśli sprzedający napisał to wyłącznie w opisie.**

Bezpłatne rozszerzenie do Chrome, Edge, Brave i Opery. Działa lokalnie, bez konta i bez serwera.

[**Zainstaluj w 2 minuty →**](#instalacja)

[![Licencja](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#licencja)

</div>

<div align="center">
  <img src="docs/screenshots/hero.png" alt="Filtr aut w lewym pasku Marketplace – na liście zostają tylko auta spełniające kryteria" width="900">
  <p><em>Sekcja „Filtr aut” w lewym pasku Marketplace. Kryteria: od 2006, benzyna lub LPG, przebieg do 250 000 km.</em></p>
</div>

> Zdjęcia ogłoszeń i lokalizacja na zrzutach są celowo rozmyte.

---

## Problem

Szukasz auta z LPG i manualną skrzynią, a przewijasz dziesiątki diesli i automatów.
Filtry Facebooka działają tylko na pola, które sprzedający wypełnił – a ci często zostawiają
je puste, wybierają „Inne” albo wpisują wszystko w opis. LPG Facebook nie ma w ogóle
na liście paliw. Każde ogłoszenie trzeba więc otworzyć i przeczytać.

## Rozwiązanie

Filtr aut robi to za Ciebie: czyta pola pojazdu **i opis ogłoszenia**, a potem ukrywa
(albo przyciemnia) wszystko, co nie spełnia Twoich kryteriów.

- **Mniej przewijania.** Na liście zostają tylko auta, które warto otworzyć.
- **LPG wreszcie da się filtrować.** Rozszerzenie rozpoznaje „1.8 + LPG”, „B+G”, „butla do 2030”,
  „sekwencja BRC” i podobne zapisy z opisu.
- **Wiesz, dlaczego coś zniknęło.** Przy każdym ogłoszeniu widać powód, np.
  *„przebieg 305 tys. km (limit 300 tys. km)”* – w trybie przyciemniania bezpośrednio na zdjęciu.
- **Bez części i ogłoszeń „kupię”.** Opcjonalnie ukrywa felgi, opony, części zamienne
  i ogłoszenia kupna, które trafiają do wyników wyszukiwania aut.

<div align="center">
  <img src="docs/screenshots/dimmed.png" alt="Tryb przyciemniania – przy każdym aucie widać, dlaczego nie pasuje" width="900">
  <p><em>Tryb „Przyciemniaj”: czerwona etykieta pokazuje, który warunek nie został spełniony.</em></p>
</div>

---

## Jak to działa

1. **Ustawiasz kryteria** w lewym pasku Marketplace: rocznik, paliwo, skrzynię i maksymalny przebieg.
2. **Rozszerzenie sprawdza ogłoszenia, które masz na ekranie.** Najpierw tytuł i dane z listy;
   jeśli to za mało, pobiera szczegóły ogłoszenia z Facebooka – tak samo, jak przy jego otwarciu.
3. **Lista się porządkuje.** Pasujące auta zostają, pozostałe znikają albo są przyciemnione.
   Licznik w panelu pokazuje, ile ogłoszeń pasuje, ile odfiltrowano i ile jest jeszcze sprawdzanych.

### Co rozpoznaje w opisie

| Dane | Przykłady zapisów |
| ---- | ----------------- |
| **Paliwo** | `1.9 TDI`, `320d`, `2.2 i-CTDi`, `dizel` → diesel · `1.4 TSI`, `benzynka` → benzyna |
| **LPG / CNG** | `1.8 + LPG`, `B+G`, `butla gazu`, `serwis gazu`, `instalacja gazowa BRC` |
| **Skrzynia** | `skrzynia automatyczna`, `S-tronic`, `DSG` → automat · `6-biegowa`, `manual` → manualna |
| **Rocznik** | `Rok produkcji: 2012`, `2006r.`, `z 2006 roku` |
| **Przebieg** | `Przebieg: 180 tys.`, `345.000 przebiegu`, `148 100 km` |

Rozszerzenie omija typowe pułapki: „klimatyzacja automatyczna”, „elektryczne szyby”,
„amortyzatory gazowe”, „bez LPG”, „nie ma automatu”, a także daty, które nie są rocznikiem
(„kupiony w 2019 roku”, „opony z 2025 roku”, „OC do 5 maja 2027”) i przebiegi serwisowe
(„rozrząd wymieniony przy 150 000 km”).

### Dane z opisu wygrywają z oczywistymi błędami

Facebook wymaga wpisania przebiegu, więc część sprzedających wpisuje cokolwiek.
Przykład z testów na żywych ogłoszeniach: Honda Accord z polem przebiegu **387 km**
i opisem *„Przebieg wynosi obecnie 387 000 km”*. Filtr z limitem 300 tys. km pokazałby
to auto jako pasujące – rozszerzenie odrzuca takie wartości (poniżej 1000 km) i bierze przebieg z opisu.

---

## Instalacja

1. Pobierz kod: na GitHubie kliknij **Code → Download ZIP** i rozpakuj archiwum
   (albo użyj `git clone`).
2. Otwórz w przeglądarce `chrome://extensions` (w Edge: `edge://extensions`).
3. Włącz **Tryb dewelopera** – przełącznik w prawym górnym rogu.
4. Kliknij **Załaduj rozpakowane** i wskaż folder z plikiem `manifest.json`.
5. Przypnij ikonę rozszerzenia do paska: ikona puzzla → pinezka.

Jeśli Facebook był już otwarty, odśwież kartę.

---

## Korzystanie

1. Otwórz Facebook Marketplace i wyszukaj auta – w kategorii **Pojazdy → Samochody**
   albo wpisując np. „passat”.
2. W lewym pasku, pod filtrami Facebooka, pojawi się sekcja **Filtr aut**. Zmiany działają
   od razu. Sekcję można zwinąć kliknięciem w nagłówek.
3. W wąskim oknie, gdy lewego paska nie ma, w lewym dolnym rogu pojawia się licznik.
   Kliknięcie tekstu włącza lub wyłącza filtr, a przycisk **Filtry** otwiera ustawienia.
   Te same ustawienia są też pod ikoną rozszerzenia.

<div align="center">
  <img src="docs/screenshots/panel.png" alt="Panel filtrów w lewym pasku Marketplace" width="320">
  <img src="docs/screenshots/popup.png" alt="Ustawienia pod ikoną rozszerzenia" width="320">
  <p><em>Panel w lewym pasku Marketplace i ustawienia pod ikoną rozszerzenia.</em></p>
</div>

### Etykiety na ogłoszeniach

| Kolor | Znaczenie |
| ----- | --------- |
| zielony | wartość spełnia kryterium |
| czerwony | wartość nie spełnia kryterium – to powód odfiltrowania |
| szary `?` | tej informacji nie ma w ogłoszeniu |
| niebieski | trwa sprawdzanie opisu |
| ciemny | informacja, po której nie filtrujesz |

### Ustawienia

- **Gdy w ogłoszeniu brakuje danych** – np. filtrujesz po skrzyni, a sprzedający nigdzie
  jej nie podał. Takie ogłoszenie możesz pokazać z etykietą „?” albo ukryć.
- **Niepasujące ogłoszenia** – ukrywaj całkowicie albo przyciemniaj. Przyciemnione
  wracają do normalnego wyglądu po najechaniu kursorem i pokazują powód odrzucenia.
- **Sprawdzaj opisy ogłoszeń** – bez tej opcji filtr korzysta tylko z tytułu i danych
  widocznych na liście, więc paliwo i skrzynia zwykle pozostaną nieznane.
- **Ukrywaj części i akcesoria** – felgi, opony, części zamienne, ogłoszenia „na części”
  i ogłoszenia kupna. Domyślnie wyłączone. Uszkodzone auta („do naprawy lub na części”)
  nie są traktowane jako części.
- **Wyczyść pamięć** – wyniki sprawdzania ogłoszeń są przechowywane przez 7 dni, żeby nie
  pobierać ich ponownie. Ten przycisk usuwa je od razu.

---

## Diagnostyka

Gdy nie wiesz, dlaczego ogłoszenie zniknęło (albo zostało), kliknij ikonę rozszerzenia
i wybierz **Kopiuj raport diagnostyczny**. Raport obejmuje wszystkie sprawdzone ogłoszenia
z bieżącej karty. Dla każdego z nich zawiera:

| Pole | Co zawiera |
| ---- | ---------- |
| **Facebook** | dane, które Facebook podaje w polach pojazdu (paliwo, skrzynia, przebieg) |
| **Na liście** | tekst widoczny na karcie ogłoszenia: cena, tytuł, miejscowość |
| **Opis** | pełny opis ogłoszenia (do 1500 znaków) |
| **Odczytano** | rocznik, paliwo, skrzynia i przebieg ustalone przez rozszerzenie |
| **Werdykt** | `PASUJE`, `NIE PASUJE`, `BRAK DANYCH` lub `NIE SAMOCHÓD` – z powodem |

Przykładowy werdykt: *„NIE PASUJE – paliwo: Diesel (wybrane: Benzyna, LPG/CNG)”*.

Raport jest gotowy do wklejenia w [zgłoszeniu na GitHubie](../../issues). W tym samym
okienku jest opcja **Zapisuj diagnostykę w konsoli** (domyślnie wyłączona) – dodaje te same
wpisy do konsoli przeglądarki (DevTools → Console).

---

## Prywatność

Wszystko dzieje się w Twojej przeglądarce.

- Rozszerzenie **nie wysyła nigdzie żadnych danych** i nie korzysta z żadnego serwera.
- Łączy się wyłącznie z `facebook.com` – tak samo, jak przy ręcznym otwieraniu ogłoszeń.
- Jedyne uprawnienie to `storage`: zapis ustawień i wyników sprawdzania ogłoszeń.
  Rozszerzenie nie ma dostępu do historii przeglądania ani do Twoich plików.

---

## Najczęstsze pytania

**Czy Facebook może zablokować mi konto?**
Rozszerzenie pobiera dane ogłoszeń tym samym zapytaniem, którego Facebook używa po otwarciu
ogłoszenia – tylko dla ogłoszeń widocznych na ekranie, maksymalnie dwa naraz i z przerwami.
Gdy Facebook zaczyna ograniczać zapytania, sprawdzanie wstrzymuje się na 3 minuty.
Nie da się jednak zagwarantować, jak Facebook oceni ruch z dowolnego rozszerzenia –
korzystasz z niego na własną odpowiedzialność.

**Czy rozpoznawanie z opisu jest nieomylne?**
Nie. To zestaw reguł dopasowanych do sposobu, w jaki ludzie piszą ogłoszenia, sprawdzony
na setkach prawdziwych ogłoszeń. Przy nietypowym opisie filtr może nic nie znaleźć –
wtedy pokazuje „?” zamiast zgadywać. Jeśli trafisz na błędny werdykt, skopiuj raport
diagnostyczny i [zgłoś problem](../../issues).

**Filtr przestał działać po aktualizacji Facebooka. Co robić?**
Facebook co jakiś czas zmienia sposób wczytywania ogłoszeń. Rozszerzenie dostosowuje się
samo, gdy otworzysz dowolne ogłoszenie – panel podpowie, kiedy to zrobić. Jeśli to nie pomoże,
zgłoś problem.

**Czy działa w aplikacji mobilnej?**
Nie. Rozszerzenie działa na `www.facebook.com` i `web.facebook.com` w przeglądarkach
opartych na Chromium. Nie obsługuje aplikacji mobilnej ani `m.facebook.com`.

**Czy rozumie ogłoszenia w innych językach?**
Rozpoznawanie z opisu jest przygotowane dla polskich ogłoszeń. Pola pojazdu wypełnione
przez sprzedającego działają niezależnie od języka.

---

## Dla programistów

```
src/core.js      – rozpoznawanie danych i logika filtrów (bez DOM, testowane w Node)
src/content.js   – integracja ze stroną Marketplace, pobieranie szczegółów, diagnostyka
src/panel.js     – panel filtrów w lewym pasku Marketplace (Shadow DOM)
src/page-hook.js – działa w kontekście strony; zapamiętuje zapytanie GraphQL Facebooka o ogłoszenie
src/content.css  – ukrywanie, przyciemnianie, etykiety i licznik
popup/           – ustawienia pod ikoną rozszerzenia
tests/           – testy jednostkowe i end-to-end
```

```sh
npm test                        # testy jednostkowe (Node 18+)
npm install && npm run test:e2e # test end-to-end w Chromium z atrapą Marketplace
```

Test end-to-end ładuje rozszerzenie do Chromium (Playwright) i podstawia sztuczne strony
`facebook.com` wraz z odpowiedziami API, więc nie wymaga konta ani dostępu do internetu.

---

## Licencja

MIT – szczegóły w pliku [LICENSE](LICENSE).
