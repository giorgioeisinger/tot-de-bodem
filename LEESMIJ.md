# Tot de bodem: website

## Hoe de site werkt

- **Afleveringen** komen automatisch uit je Spotify-feed. Publiceer je een aflevering op
  Spotify (of pas je een titel of beschrijving aan), dan staat dat vanzelf op de site.
  Je hoeft daarvoor niets te uploaden.
- **Belangrijk:** begin elke titel op Spotify met het nummer: `2.3 Titel` of `2.3: Titel`.
  Het getal vóór de punt bepaalt het hoofdstuk.
- **Alle andere teksten** staan in de map `content/` (straks via `/admin` te bewerken).

| Bestand                     | Wat staat erin?                                              |
|-----------------------------|--------------------------------------------------------------|
| `content/site.json`         | Titel, introductietekst, adres van de Spotify-feed, voettekst, pagina "Over ons" |
| `content/hoofdstukken.json` | De menugroepen en de 18 hoofdstukken (titel, ondertitel, beschrijving) |
| `content/shownotes.json`    | Extra's per aflevering: besproken wijnen, bronnen, links      |
| `index.html`, `app.js`, `style.css` | De website zelf. Hoef je niet aan te komen.           |

### Shownotes toevoegen (tot `/admin` klaar is)

Open `content/shownotes.json` met Kladblok (rechtermuisknop → Openen met). Voorbeeld:

```json
{
  "afleveringen": [
    {
      "nummer": "1.4",
      "wijnen": ["Chablis Premier Cru", "Riesling uit de Moezel"],
      "bronnen": [{ "titel": "Naam van het artikel", "url": "https://..." }],
      "links": []
    }
  ]
}
```

`nummer` is het nummer van de aflevering zoals op Spotify.

## Lokaal bekijken

Dubbelklikken op `index.html` werkt niet meer, omdat de site zijn teksten los inlaadt. Bekijk de site
online, of vraag Claude om hem lokaal te starten.

## Online zetten

Tot de koppeling met GitHub klaar is: sleep de map `tot-de-bodem` naar het tabblad **Deploys**
bij Netlify en ververs daarna met Ctrl+F5. Daarna gaat dit automatisch.
