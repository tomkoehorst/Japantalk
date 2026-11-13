# Japantalk 🐱

Een app in je browser om Japans te leren **praten**. Het idee komt van Duolingo, maar er zijn geen kistjes, edelstenen, levens of aankopen in de app. Je hoeft niets te typen: je luistert, tikt en spreekt.

## Gebruiken
Open `index.html` in **Chrome, Edge of Safari**. De spraakherkenning werkt alleen via `https://` of `localhost`. Zo kun je het lokaal draaien:

```bash
python3 -m http.server 8000
# open daarna http://localhost:8000
```

Je kunt de app ook via GitHub Pages hosten. Dat werkt dan meteen, ook op je telefoon.

- Firefox heeft geen spraakherkenning. In die browser beoordeel je zelf of je het goed zei.
- Kun je even niet praten? Tik dan in een les op **"Kan nu niet praten"**. De spreekoefeningen worden dan luisteroefeningen.

## Wat zit erin
- 8 units (begroeten, beleefdheid, jezelf voorstellen, getallen, restaurant, de weg vragen, winkelen, smalltalk). Elke unit heeft 3 lessen.
- Soorten oefeningen: naspreken, vertalen door te spreken, luisteren en kiezen, de juiste Japanse zin kiezen, en een rollenspel met Neko de kat.
- Een dagdoel, een streak en XP. Een oefenmodus herhaalt de zinnen die je nog lastig vindt.
- Je voortgang staat in de localStorage van je browser.
