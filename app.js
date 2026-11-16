/*
  Tot de bodem — websitelogica.
  - Afleveringen komen live uit de Spotify-feed (adres in content/site.json).
  - Hoofdstukken, Over ons en shownotes staan in de map content/ en zijn
    via /admin te bewerken.
  - Titels in Spotify beginnen met "H.A" (bv. "2.3 Titel"): H = hoofdstuk.
*/
(function () {
  "use strict";

  const main = document.getElementById("main");
  const el = (id) => document.getElementById(id);

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';

  // ---- Hulpjes ----
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const opslag = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niet beschikbaar */ } }
  };
  const tijd = (s) => {
    if (!isFinite(s) || s < 0) return "0:00";
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };
  const naarSeconden = (d) => {
    if (!d) return 0;
    if (/^\d+$/.test(d)) return +d;
    return d.split(":").reduce((t, x) => t * 60 + (+x || 0), 0);
  };
  const luistertijd = (s) => {
    const m = Math.round(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)} u ${m % 60} min` : `${m} min`;
  };
  const datumNL = (d) => d ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "";
  const meervoud = (n, een, veel) => `${n} ${n === 1 ? een : veel}`;

  // ---- Gegevens ----
  let SITE = null;
  let HS = { groepen: [], hoofdstukken: [] };
  const NOTES = {};
  let eps = [];
  const perId = {};
  const perHoofdstuk = {};
  const hoofdstukNr = {};
  let feedStatus = "laden"; // laden | ok | oud | fout

  async function laadJSON(pad) {
    const r = await fetch(pad, { cache: "no-cache" });
    if (!r.ok) throw new Error(pad + " " + r.status);
    return r.json();
  }

  function alineas(html) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    const ps = [...doc.querySelectorAll("p")].map((p) => p.textContent.trim());
    const delen = ps.length ? ps : [doc.body.textContent.trim()];
    return delen.filter((t) => t && !/^\*?\s*gemaakt met behulp van ai\.?$/i.test(t));
  }

  function leesFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("feed onleesbaar");
    return [...doc.getElementsByTagName("item")].map((it) => {
      const tekst = (naam) => { const x = it.getElementsByTagName(naam)[0]; return x ? x.textContent : ""; };
      const itunes = (naam) => { const x = it.getElementsByTagNameNS("*", naam)[0]; return x ? x.textContent : ""; };
      const ruw = tekst("title").trim();
      const m = ruw.match(/^(\d+)\.(\d+)\s*[:.\-–—]?\s*(.*)$/);
      const bijlage = it.getElementsByTagName("enclosure")[0];
      const datum = new Date(tekst("pubDate"));
      return {
        hoofdstuk: m ? +m[1] : null,
        deel: m ? +m[2] : null,
        nummer: m ? `${+m[1]}.${+m[2]}` : "",
        titel: (m && m[3]) || ruw,
        audio: bijlage ? bijlage.getAttribute("url") : "",
        datum: isNaN(datum) ? null : datum,
        duur: naarSeconden(itunes("duration").trim()),
        samenvatting: alineas(tekst("description") || itunes("summary"))
      };
    }).filter((e) => e.audio);
  }

  function verwerkAfleveringen(lijst) {
    eps = lijst.slice().sort((a, b) =>
      (a.hoofdstuk ?? 9999) - (b.hoofdstuk ?? 9999) ||
      (a.deel ?? 0) - (b.deel ?? 0) ||
      (a.datum || 0) - (b.datum || 0));
    eps.forEach((e, i) => {
      e.id = e.nummer || "x" + i;
      e.index = i;
      e.notes = NOTES[e.nummer] || {};
      perId[e.id] = e;
      const k = e.hoofdstuk != null && hoofdstukNr[e.hoofdstuk] ? e.hoofdstuk : "overig";
      (perHoofdstuk[k] = perHoofdstuk[k] || []).push(e);
    });
  }

  async function laadFeed() {
    const SLEUTEL = "tdb-feed";
    try {
      const r = await fetch(SITE.feed, { cache: "no-cache" });
      if (!r.ok) throw new Error("feed " + r.status);
      const xml = await r.text();
      verwerkAfleveringen(leesFeed(xml));
      opslag.set(SLEUTEL, xml);
      feedStatus = "ok";
    } catch (e) {
      // Geen verbinding met Spotify? Dan de laatst bekende versie gebruiken.
      const oud = opslag.get(SLEUTEL);
      if (oud) {
        try { verwerkAfleveringen(leesFeed(oud)); feedStatus = "oud"; return; } catch (x) { /* ook kapot */ }
      }
      feedStatus = "fout";
    }
  }

  const hLabel = (h) => `${h.nummer} · ${h.titel}`;
  const groepVan = (h) => HS.groepen.find((g) => g.id === h.groep);
  const nieuwste = () => eps.slice().sort((a, b) => (b.datum || 0) - (a.datum || 0) || b.index - a.index);

  // ---- Bouwstenen ----
  const playKnop = (ep, groot) =>
    `<button type="button" class="playbtn${groot ? " lg" : ""}" data-play="${esc(ep.id)}" aria-label="Speel ${esc(ep.titel)}">${ICON_PLAY}</button>`;

  const epMeta = (ep, metHoofdstuk) => {
    const h = hoofdstukNr[ep.hoofdstuk];
    return [
      ep.nummer ? "Aflevering " + esc(ep.nummer) : "",
      metHoofdstuk && h ? esc(h.titel) : "",
      esc(datumNL(ep.datum)),
      ep.duur ? esc(tijd(ep.duur)) : ""
    ].filter(Boolean).join(" · ");
  };

  const epItem = (ep, metHoofdstuk) => `
    <li class="ep" data-ep="${esc(ep.id)}">
      ${playKnop(ep)}
      <div>
        <div class="ep-meta">${epMeta(ep, metHoofdstuk)}</div>
        <h3><a href="#/aflevering/${esc(ep.id)}">${esc(ep.titel)}</a></h3>
        ${ep.samenvatting[0] ? `<p>${esc(ep.samenvatting[0])}</p>` : ""}
        <a class="more" href="#/aflevering/${esc(ep.id)}">Lees meer →</a>
      </div>
    </li>`;

  const feedMelding = () =>
    feedStatus === "fout" ? `<p class="melding">De afleveringen konden niet worden geladen. Controleer je internetverbinding en probeer het later opnieuw.</p>`
    : feedStatus === "oud" ? `<p class="melding zacht">Geen verbinding met Spotify: je ziet de laatst bekende afleveringen.</p>`
    : "";

  // ---- Weergave: home ----
  const homeStaat = { zoek: "" };

  function renderHome() {
    const nieuw = nieuwste()[0];
    main.innerHTML = `
      <section class="hero">
        <div class="wrap">
          <p class="kicker">${esc(SITE.ondertitel)}</p>
          <h1>${esc(SITE.titel)}</h1>
          <p class="lead">${esc(SITE.intro)}</p>
          ${nieuw ? `<button type="button" class="btn" data-play="${esc(nieuw.id)}">${ICON_PLAY}<span>Luister de nieuwste aflevering</span></button>` : ""}
        </div>
        <svg class="strata" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 30 C200 10 380 45 600 28 S1000 8 1200 26 V100 H0Z" fill="var(--mos)" opacity=".85"/>
          <path d="M0 50 C220 34 420 66 640 50 S1010 34 1200 52 V100 H0Z" fill="var(--klei)" opacity=".9"/>
          <path d="M0 70 C180 60 400 84 620 70 S980 58 1200 74 V100 H0Z" fill="var(--steen)"/>
          <path d="M0 86 C240 78 460 96 700 86 S1040 78 1200 90 V100 H0Z" fill="var(--aarde)"/>
        </svg>
      </section>
      <section class="section">
        <div class="wrap">
          ${feedMelding()}
          <div class="toolbar">
            <h2 class="sectiekop" id="lijstKop">Luisteren</h2>
            <input type="search" class="search" id="zoek" placeholder="Zoek in alle afleveringen…" aria-label="Zoek in alle afleveringen" value="${esc(homeStaat.zoek)}">
          </div>
          <div id="homeInhoud"></div>
        </div>
      </section>`;
    const zoek = el("zoek");
    zoek.addEventListener("input", () => { homeStaat.zoek = zoek.value; renderHomeInhoud(); });
    renderHomeInhoud();
  }

  function renderHomeInhoud() {
    const q = homeStaat.zoek.trim().toLowerCase();
    const doel = el("homeInhoud");
    if (q) {
      el("lijstKop").textContent = "Zoekresultaten";
      const hits = eps.filter((e) => (e.nummer + " " + e.titel + " " + e.samenvatting.join(" ")).toLowerCase().includes(q));
      doel.innerHTML = hits.length
        ? `<ol class="eps">${hits.map((e) => epItem(e, true)).join("")}</ol>`
        : `<p class="empty">Geen afleveringen gevonden voor “${esc(homeStaat.zoek)}”.</p>`;
      updateKnoppen();
      return;
    }
    el("lijstKop").textContent = "Luisteren";
    const recent = nieuwste().slice(0, 3);
    let html = "";
    HS.groepen.forEach((g) => {
      const hs = HS.hoofdstukken.filter((h) => h.groep === g.id);
      if (!hs.length) return;
      html += `
        <div class="groep">
          <h3 class="groepkop">${esc(g.titel)}</h3>
          <div class="hcards">
            ${hs.map((h) => {
              const lijst = perHoofdstuk[h.nummer] || [];
              const totaal = lijst.reduce((t, e) => t + e.duur, 0);
              return `
                <a class="hcard${lijst.length ? "" : " leeg"}" href="#/hoofdstuk/${h.nummer}">
                  <span class="hnum">${h.nummer}</span>
                  <span class="htitel">${esc(h.titel)}</span>
                  ${h.ondertitel ? `<span class="hsub">${esc(h.ondertitel)}</span>` : ""}
                  <span class="hmeta">${lijst.length ? `${meervoud(lijst.length, "aflevering", "afleveringen")} · ${luistertijd(totaal)}` : "Binnenkort"}</span>
                </a>`;
            }).join("")}
          </div>
        </div>`;
    });
    const overig = perHoofdstuk.overig || [];
    doel.innerHTML = `
      ${recent.length ? `<div class="groep"><h3 class="groepkop">Nieuwste afleveringen</h3><ol class="eps">${recent.map((e) => epItem(e, true)).join("")}</ol></div>` : ""}
      ${html}
      ${overig.length ? `<div class="groep"><h3 class="groepkop">Overige afleveringen</h3><ol class="eps">${overig.map((e) => epItem(e)).join("")}</ol></div>` : ""}`;
    updateKnoppen();
  }

  // ---- Weergave: hoofdstuk ----
  let nieuwsteEerst = false;

  function renderHoofdstuk(nr) {
    const h = hoofdstukNr[nr];
    if (!h) { niet("Dit hoofdstuk bestaat niet."); return; }
    const i = HS.hoofdstukken.indexOf(h);
    const vorige = HS.hoofdstukken[i - 1], volgende = HS.hoofdstukken[i + 1];
    const g = groepVan(h);
    const lijst = perHoofdstuk[h.nummer] || [];
    const totaal = lijst.reduce((t, e) => t + e.duur, 0);
    main.innerHTML = `
      <div class="wrap page">
        <a class="back" href="#/">← Alle hoofdstukken</a>
        <header class="h-kop">
          ${g ? `<p class="kicker">${esc(g.titel)}</p>` : ""}
          <h1><span class="hnum groot">${h.nummer}</span>${esc(h.titel)}</h1>
          ${h.ondertitel ? `<p class="h-sub">${esc(h.ondertitel)}</p>` : ""}
          ${h.beschrijving ? `<p class="prose">${esc(h.beschrijving)}</p>` : ""}
        </header>
        ${feedMelding()}
        ${lijst.length ? `
          <div class="toolbar">
            <p class="muted">${meervoud(lijst.length, "aflevering", "afleveringen")} · ${luistertijd(totaal)}</p>
            <button type="button" class="linkbtn" id="volgorde">${nieuwsteEerst ? "Vanaf het begin" : "Nieuwste eerst"}</button>
          </div>
          <ol class="eps" id="hLijst"></ol>`
        : feedStatus === "fout" ? "" : `<p class="empty">Nog geen afleveringen in dit hoofdstuk. Binnenkort meer!</p>`}
        <nav class="pager" aria-label="Andere hoofdstukken">
          ${vorige ? `<a href="#/hoofdstuk/${vorige.nummer}"><span>← Vorig hoofdstuk</span>${esc(hLabel(vorige))}</a>` : "<span></span>"}
          ${volgende ? `<a class="rechts" href="#/hoofdstuk/${volgende.nummer}"><span>Volgend hoofdstuk →</span>${esc(hLabel(volgende))}</a>` : ""}
        </nav>
      </div>`;
    const vulLijst = () => {
      const ol = el("hLijst");
      if (ol) ol.innerHTML = (nieuwsteEerst ? lijst.slice().reverse() : lijst).map((e) => epItem(e)).join("");
      updateKnoppen();
    };
    const knop = el("volgorde");
    if (knop) knop.addEventListener("click", () => {
      nieuwsteEerst = !nieuwsteEerst;
      knop.textContent = nieuwsteEerst ? "Vanaf het begin" : "Nieuwste eerst";
      vulLijst();
    });
    vulLijst();
    document.title = hLabel(h) + " · " + SITE.titel;
  }

  // ---- Weergave: aflevering ----
  function renderAflevering(id) {
    const ep = perId[id];
    if (!ep) { niet(feedStatus === "fout" ? "De afleveringen konden niet worden geladen." : "Deze aflevering bestaat niet (meer)."); return; }
    const h = hoofdstukNr[ep.hoofdstuk];
    const n = ep.notes;
    const lijstje = (items) => items.map((x) => typeof x === "string"
      ? `<li>${esc(x)}</li>`
      : `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titel || x.url)}</a>` : esc(x.titel)}</li>`).join("");
    const blok = (cls, kop, items) => items && items.length ? `<section class="note ${cls}"><h2>${kop}</h2><ul>${lijstje(items)}</ul></section>` : "";
    const vorige = eps[ep.index - 1], volgende = eps[ep.index + 1];
    const label = (e) => (e.nummer ? e.nummer + " " : "") + e.titel;

    main.innerHTML = `
      <article class="wrap page">
        <a class="back" href="${h ? "#/hoofdstuk/" + h.nummer : "#/"}">← ${h ? esc(hLabel(h)) : "Alle hoofdstukken"}</a>
        <div class="ep-hero">
          ${playKnop(ep, true)}
          <div>
            <div class="ep-meta">${epMeta(ep)}</div>
            <h1>${esc(ep.titel)}</h1>
          </div>
        </div>
        ${ep.samenvatting.length ? `<div class="prose">${ep.samenvatting.map((p) => `<p>${esc(p)}</p>`).join("")}</div>` : ""}
        ${n.tekst ? `<div class="prose">${String(n.tekst).split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("")}</div>` : ""}
        <div class="notes">
          ${blok("wijnen", "Besproken wijnen", n.wijnen)}
          ${blok("bronnen", "Bronnen", n.bronnen)}
          ${blok("links", "Links", n.links)}
        </div>
        <nav class="pager" aria-label="Andere afleveringen">
          ${vorige ? `<a href="#/aflevering/${esc(vorige.id)}"><span>← Vorige</span>${esc(label(vorige))}</a>` : "<span></span>"}
          ${volgende ? `<a class="rechts" href="#/aflevering/${esc(volgende.id)}"><span>Volgende →</span>${esc(label(volgende))}</a>` : ""}
        </nav>
      </article>`;
    document.title = ep.titel + " · " + SITE.titel;
  }

  // ---- Weergave: over ons ----
  function renderOver() {
    const o = SITE.over || {};
    const initialen = (n) => esc(String(n).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase());
    main.innerHTML = `
      <div class="wrap page">
        <h1 class="paginatitel">Over ${esc(SITE.titel)}</h1>
        <div class="over-tekst">${(o.tekst || []).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        ${o.makers && o.makers.length ? `<div class="makers">${o.makers.map((m) => `
          <div class="maker">
            ${m.foto ? `<img class="avatar" src="${esc(m.foto)}" alt="">` : `<div class="avatar" aria-hidden="true">${initialen(m.naam)}</div>`}
            <h2>${esc(m.naam)}</h2>
            ${m.rol ? `<p class="rol">${esc(m.rol)}</p>` : ""}
            <p>${esc(m.bio)}</p>
          </div>`).join("")}</div>` : ""}
        ${o.contact ? `<p class="contact">Contact: <a href="mailto:${esc(o.contact)}">${esc(o.contact)}</a></p>` : ""}
      </div>`;
    document.title = "Over ons · " + SITE.titel;
  }

  function niet(tekst) {
    main.innerHTML = `<div class="wrap page"><a class="back" href="#/">← Alle hoofdstukken</a><p class="empty">${esc(tekst)}</p></div>`;
  }

  // ---- Hoofdstukmenu ----
  const menu = el("menu"), menuKnop = el("menuKnop"), paneel = el("menuPaneel");
  const hoverModus = window.matchMedia("(hover: hover) and (min-width: 820px)");
  let sluitTimer = null;

  function bouwMenu() {
    paneel.innerHTML = HS.groepen.map((g) => {
      const hs = HS.hoofdstukken.filter((h) => h.groep === g.id);
      if (!hs.length) return "";
      const bereik = hs.length > 1 ? `${hs[0].nummer}–${hs[hs.length - 1].nummer}` : `${hs[0].nummer}`;
      return `
        <div class="mp-g" data-groep="${esc(g.id)}">
          <button type="button" class="mp-groep" aria-expanded="false">
            <span>${esc(g.titel)}</span><span class="mp-bereik">${bereik}</span>
          </button>
          <ul class="mp-sub">
            ${hs.map((h) => `<li><a href="#/hoofdstuk/${h.nummer}" data-h="${h.nummer}"><span class="mp-n">${h.nummer}</span><span>${esc(h.titel)}</span></a></li>`).join("")}
          </ul>
        </div>`;
    }).join("");

    paneel.querySelectorAll(".mp-g").forEach((g) => {
      const knop = g.querySelector(".mp-groep");
      knop.addEventListener("mouseenter", () => { if (hoverModus.matches) zetGroep(g); });
      knop.addEventListener("focus", () => { if (hoverModus.matches) zetGroep(g); });
      knop.addEventListener("click", () => {
        if (hoverModus.matches) zetGroep(g);
        else zetGroep(g.classList.contains("open") ? null : g);
      });
    });
  }

  function zetGroep(g) {
    paneel.querySelectorAll(".mp-g").forEach((x) => {
      const aan = x === g;
      x.classList.toggle("open", aan);
      x.querySelector(".mp-groep").setAttribute("aria-expanded", String(aan));
    });
  }

  function huidigeGroep() {
    const m = location.hash.match(/^#\/(hoofdstuk|aflevering)\/([^/]+)/);
    if (!m) return null;
    const nr = m[1] === "hoofdstuk" ? +m[2] : (perId[decodeURIComponent(m[2])] || {}).hoofdstuk;
    const h = hoofdstukNr[nr];
    return h ? paneel.querySelector(`.mp-g[data-groep="${h.groep}"]`) : null;
  }

  function openMenu(open) {
    clearTimeout(sluitTimer);
    if (open === menu.classList.contains("open")) return;
    menu.classList.toggle("open", open);
    menuKnop.setAttribute("aria-expanded", String(open));
    if (open) zetGroep(huidigeGroep() || (hoverModus.matches ? paneel.querySelector(".mp-g") : null));
  }

  menuKnop.addEventListener("click", () => {
    // Met muis opent het menu al bij erover gaan; klikken houdt het dan open.
    openMenu(hoverModus.matches ? true : !menu.classList.contains("open"));
  });
  menuKnop.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); openMenu(true); const k = paneel.querySelector(".mp-g.open .mp-groep, .mp-groep"); if (k) k.focus(); }
  });
  menu.addEventListener("mouseenter", () => { if (hoverModus.matches) openMenu(true); });
  menu.addEventListener("mouseleave", () => {
    if (hoverModus.matches) sluitTimer = setTimeout(() => openMenu(false), 250);
  });
  menu.addEventListener("focusout", (e) => { if (!menu.contains(e.relatedTarget)) openMenu(false); });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) openMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("open")) { openMenu(false); menuKnop.focus(); }
  });

  // ---- Router ----
  function route() {
    if (!SITE) return; // nog aan het laden
    const [pagina, id] = location.hash.replace(/^#\/?/, "").split("/");
    document.title = SITE.titel + " · " + SITE.ondertitel.toLowerCase();
    if (pagina === "aflevering") renderAflevering(decodeURIComponent(id || ""));
    else if (pagina === "hoofdstuk") renderHoofdstuk(+id);
    else if (pagina === "over") renderOver();
    else renderHome();
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const actief = a.dataset.nav === "over" ? pagina === "over" : (pagina === "hoofdstuk" || pagina === "aflevering");
      if (actief) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    openMenu(false);
    window.scrollTo(0, 0);
    updateKnoppen();
  }
  window.addEventListener("hashchange", route);
  el("skip").addEventListener("click", (e) => { e.preventDefault(); main.focus(); });

  // ---- Speler ----
  const audio = el("audio");
  const speler = el("player"), pToggle = el("pToggle"), pSeek = el("pSeek"), pCur = el("pCur"), pDur = el("pDur");
  const pTitle = el("pTitle"), pSerie = el("pSerie"), pError = el("pError"), pRate = el("pRate");
  const SNELHEDEN = [1, 1.25, 1.5, 1.75, 2, 0.75];
  let huidig = null;
  let slepen = false;

  function bewaarPositie() {
    if (huidig && audio.currentTime > 0) {
      const pos = opslag.get("tdb-posities") || {};
      pos[huidig.id] = audio.ended ? 0 : Math.floor(audio.currentTime);
      opslag.set("tdb-posities", pos);
    }
  }

  function speel(ep) {
    if (huidig && huidig.id === ep.id) {
      if (audio.paused) audio.play().catch(toonFout); else audio.pause();
      return;
    }
    bewaarPositie();
    huidig = ep;
    pError.hidden = true;
    audio.src = ep.audio;
    const opgeslagen = (opslag.get("tdb-posities") || {})[ep.id];
    if (opgeslagen) {
      audio.addEventListener("loadedmetadata", () => {
        if (opgeslagen < audio.duration - 5) audio.currentTime = opgeslagen;
      }, { once: true });
    }
    audio.playbackRate = opslag.get("tdb-snelheid") || 1;
    audio.play().catch(() => {});

    const h = hoofdstukNr[ep.hoofdstuk];
    pTitle.textContent = (ep.nummer ? ep.nummer + " " : "") + ep.titel;
    pTitle.href = "#/aflevering/" + ep.id;
    pSerie.textContent = h ? h.titel : "";
    pCur.textContent = "0:00";
    pDur.textContent = ep.duur ? tijd(ep.duur) : "0:00";
    pSeek.value = 0;
    speler.hidden = false;
    document.body.classList.add("has-player");

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ep.titel, artist: SITE.titel, album: h ? hLabel(h) : SITE.titel,
        artwork: [{ src: "omslag-512.jpg", sizes: "512x512", type: "image/jpeg" }]
      });
    }
    updateKnoppen();
  }

  function toonFout() {
    pError.textContent = "Deze aflevering kon niet worden geladen.";
    pError.hidden = false;
    updateKnoppen();
  }

  function updateKnoppen() {
    const speelt = huidig && !audio.paused;
    pToggle.innerHTML = speelt ? ICON_PAUSE : ICON_PLAY;
    pToggle.setAttribute("aria-label", speelt ? "Pauzeer" : "Afspelen");
    document.querySelectorAll("[data-play]").forEach((b) => {
      const dit = huidig && b.dataset.play === huidig.id && speelt;
      const svg = b.querySelector("svg");
      if (svg) svg.outerHTML = dit ? ICON_PAUSE : ICON_PLAY;
      if (b.classList.contains("playbtn")) b.setAttribute("aria-label", (dit ? "Pauzeer " : "Speel ") + (perId[b.dataset.play] || {}).titel);
    });
    document.querySelectorAll(".ep").forEach((li) => li.classList.toggle("is-current", !!huidig && li.dataset.ep === huidig.id));
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-play]");
    if (b && perId[b.dataset.play]) speel(perId[b.dataset.play]);
  });
  pToggle.addEventListener("click", () => huidig && speel(huidig));
  el("pBack").addEventListener("click", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  el("pFwd").addEventListener("click", () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 30); });
  pRate.addEventListener("click", () => {
    const volgende = SNELHEDEN[(SNELHEDEN.indexOf(audio.playbackRate) + 1) % SNELHEDEN.length];
    audio.playbackRate = volgende;
    opslag.set("tdb-snelheid", volgende);
  });

  pSeek.addEventListener("input", () => {
    slepen = true;
    if (audio.duration) pCur.textContent = tijd((pSeek.value / 1000) * audio.duration);
  });
  pSeek.addEventListener("change", () => {
    if (audio.duration) audio.currentTime = (pSeek.value / 1000) * audio.duration;
    slepen = false;
  });

  audio.addEventListener("play", updateKnoppen);
  audio.addEventListener("pause", () => { updateKnoppen(); bewaarPositie(); });
  audio.addEventListener("ended", () => { bewaarPositie(); updateKnoppen(); });
  audio.addEventListener("error", () => { if (huidig) toonFout(); });
  audio.addEventListener("ratechange", () => { pRate.textContent = String(audio.playbackRate).replace(".", ",") + "×"; });
  audio.addEventListener("loadedmetadata", () => { pDur.textContent = tijd(audio.duration); });
  let laatsteOpslag = 0;
  audio.addEventListener("timeupdate", () => {
    if (!slepen && audio.duration) {
      pSeek.value = Math.round((audio.currentTime / audio.duration) * 1000);
      pCur.textContent = tijd(audio.currentTime);
    }
    if (Date.now() - laatsteOpslag > 5000) { laatsteOpslag = Date.now(); bewaarPositie(); }
  });
  window.addEventListener("pagehide", bewaarPositie);

  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler("play", () => audio.play());
      ms.setActionHandler("pause", () => audio.pause());
      ms.setActionHandler("seekbackward", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
      ms.setActionHandler("seekforward", () => { audio.currentTime += 30; });
    } catch (e) { /* niet ondersteund */ }
  }

  // ---- Start ----
  async function start() {
    main.innerHTML = `<div class="wrap page"><p class="laden">Afleveringen laden…</p></div>`;
    try {
      const [site, hs, notes] = await Promise.all([
        laadJSON("content/site.json"),
        laadJSON("content/hoofdstukken.json"),
        laadJSON("content/shownotes.json").catch(() => ({ afleveringen: [] }))
      ]);
      SITE = site;
      HS = hs;
      HS.hoofdstukken.sort((a, b) => a.nummer - b.nummer);
      HS.hoofdstukken.forEach((h) => { hoofdstukNr[h.nummer] = h; });
      (notes.afleveringen || []).forEach((n) => { if (n.nummer) NOTES[String(n.nummer).trim()] = n; });
    } catch (e) {
      main.innerHTML = `<div class="wrap page"><p class="empty">De website kon niet worden geladen. Probeer de pagina te verversen.</p></div>`;
      return;
    }
    if (SITE.voettekst) el("voettekst").textContent = SITE.voettekst;
    bouwMenu();
    await laadFeed();
    route();
  }
  start();
})();
