# Japantalk 🐱

Een Android-app om Japans te leren **praten**. Het idee komt van Duolingo, maar er zijn geen kistjes, edelstenen, levens of aankopen in de app. Je hoeft niets te typen: je luistert, tikt en spreekt.

## Installeren
Bij elke push bouwt GitHub Actions automatisch een APK (zie `.github/workflows/android.yml`).
1. Ga op je telefoon naar **Releases** van deze repo en download `Japantalk.apk` van de nieuwste release.
2. Open het bestand en sta "installeren uit onbekende bronnen" toe voor je browser.
3. Bij de eerste keer praten vraagt de app om de microfoon.

De app gebruikt de spraakherkenning en de spraak van Android zelf. Daarvoor moet de **Google-app** geïnstalleerd zijn. Hoor je geen Japans? Kijk dan in de Android-instellingen bij *Tekst-naar-spraak* of de Japanse stem gedownload is.

Elke APK wordt met dezelfde sleutel (`keystore/debug.keystore`) ondertekend. Daardoor installeert een nieuwe versie gewoon over de oude heen en blijft je voortgang bewaard.

## Hoe het in elkaar zit
- `index.html` bevat de hele app (HTML, CSS, JS en de lesinhoud).
- Capacitor verpakt de app als Android-app. De community-plugins `speech-recognition` en `text-to-speech` leveren de spraak.
- Updates: de app vraagt bij GitHub Releases naar de nieuwste versie (repo moet openbaar zijn), downloadt de APK en opent het installatiescherm.
- `npm run www` zet `index.html` en het lettertype Nunito klaar in `www/`. De CI-build doet de rest (`cap add android`, icoon uit `assets/`, `gradlew assembleDebug`).
- Je voortgang staat in de opslag van de app op je telefoon.
