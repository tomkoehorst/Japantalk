# Plan Japantalk 🗾

**Doel:** eind 2027 op reis in Japan kunnen praten met locals: bestellen, de weg vragen, inchecken, een praatje maken. Daarbij hoort ook **verstaan wat ze terugzeggen**.
**Tijd:** ongeveer 12 maanden. Met 10–15 minuten per dag haal je dat ruim.

## Hoe we werken
- Kleine stappen. Elke push levert een nieuwe APK op, en de app meldt die update zelf.
- Na elke stap test jij op je telefoon. Daarna gaan we verder.

---

## ✅ Gedaan
- Spreek-app in Duolingo-stijl, zonder kistjes of aankopen: 8 units en 24 lessen.
- Android-app via GitHub Actions, met de spraak en spraakherkenning van Android.
- Updates in de app: melden, downloaden en installeren.

## Fase 1: UX-basis (nu)
1. **Onboarding:** je naam (私は〇〇です met je eigen naam), je dagdoel, uitleg over de microfoon en een test of je de stem hoort.
2. **Tabs onderin:** Leren · Oefenen · Mijn zinnen · Profiel.
3. **Gevoel tijdens een les:** trillen, vloeiendere animaties, een combo bij meerdere goede antwoorden op rij, en een statusbalk in de kleuren van de app.
4. **Betere feedback op je uitspraak:** laten zien wélk deel van de zin niet goed was.
5. **Technisch:** de lesinhoud uit `index.html` halen en in een eigen bestand zetten.

## Fase 2: effectiever leren
6. **Herhaling op het juiste moment** (spaced repetition), met een dagelijkse herhaalsessie.
7. **Mijn zinnen:** een lijst met alles wat je geleerd hebt, af te spelen en met favorieten. Handig als spiekboekje op reis.
8. **Shadowing:** direct met Neko meepraten, voor je ritme en uitspraak.
9. **Korte uitleg** bij nieuwe patronen (は, を, ください, ～ますか …).
10. **Luisteren naar het antwoord:** oefeningen waarin een local iets terugzegt en jij moet snappen wat het betekent.

## Fase 3: inhoud voor de reis
Elke unit krijgt een **"Wat zeggen zij?"-deel** met de zinnen die je daar te horen krijgt.

| Unit | Jij zegt | Zij zeggen (verstaan) |
|---|---|---|
| Aankomst & luchthaven | waar is…, ik ben toerist, 2 weken | パスポートをお願いします |
| Trein & metro | kaartje naar…, welk perron, stopt deze in… | 次は〜です, 〜番線 |
| Hotel & ryokan | inchecken, reservering op naam van…, wifi? | お名前をお願いします, 朝食は7時からです |
| Konbini | zakje graag, betalen met kaart | 温めますか？, ポイントカードはお持ちですか？ |
| Izakaya & restaurant uitgebreid | aanrader?, allergie, niet pittig, met hoeveel? | 何名様ですか？, 少々お待ちください |
| Tempels, onsen & etiquette | mag ik een foto maken?, is dit goed zo? | 写真はご遠慮ください |
| Geld, tijd & getallen tot 10.000 | hoe laat?, hoe lang?, ¥3.500 | 三千五百円です |
| Contact met locals | ik kom uit Nederland, ik leer Japans, mooie stad! | どこから来ましたか？, 日本語上手ですね！ |
| Hulp & noodgevallen | apotheek, ik ben ziek, help, ik ben verdwaald | 大丈夫ですか？ |

11. **Gesprekken met keuzes:** jij kiest je antwoord en Neko reageert daarop.
12. **Reismodus:** vóór de reis een snelle herhaling per situatie ("ik ga nu naar een restaurant").

## Fase 4: extra's
13. Een dagelijkse herinnering voor je streak.
14. Een back-up van je voortgang (export/import).
15. *(Optioneel)* Vrij gesprek met een AI-gesprekspartner. Daarvoor is een API-sleutel nodig, en het kost geld per gesprek.

## Ruwe tijdlijn
- **Nov–dec 2026:** fase 1
- **Jan–mrt 2027:** fase 2 en de eerste reis-units
- **Apr–sep 2027:** de overige reis-units en gesprekken met keuzes
- **Okt 2027 → vertrek:** reismodus, herhalen, oefenen met "verstaan"
