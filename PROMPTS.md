# PROMPTS.md — Makra pro Stickman

Projektově specifická makra. Globální makra (`@THINK`, `@AUDIT:CODE`, `@AUDIT:DOCS`, `@DOCS`, `@CALIBRATE`) jsou v `~/.claude/CLAUDE.md` a platí i zde.

---

## `@BEGIN` — zahájení sezení

Zahajujeme nové sezení na projektu Stickman.

**(1.) Git sync** *(povinný první krok — projekt běží na dvou strojích):*

```bash
git add . && git stash save "Auto-stash before pull" && git pull && (git stash pop || true)
```

Pokud pracovní strom je čistý, stash je no-op. Konflikty: vyřeš (upstream = novější preferovat), pak `git stash drop`.

**(2.) Kontext** — přečti:
- `TODO.md` — co je rozděláno a čeká.
- `DIARY.md` (index) + poslední `docs/diary/YYYY-MM-DD.md` — kontext minulého sezení.
- `GLOSSARY.md` — aktuální terminologie.
- Memory (`MEMORY.md` v memory dir) — relevantní záznamy.

**(3.) Shrnutí** — vypiš sekci **Příště** z posledního diáře jako první bod programu a navrhni, čím začneme.

Stale Příště check: opakuje-li se položka ≥ 5 sezení → **⚠ Stale Příště — rozhodnout: DO nebo DROP.**

**(4.) Připomenutí:**
- **Kudos!/Censure! feedback je aktivní** (oboustranný).
- Poměr kritika/pochlebování **80/20** — žádné úvodní lichotky.

**(5.) Spusť server** *(povinný poslední krok):*

Nejdřív zkontroluj port 8000:

```bash
netstat -ano | grep ':8000'
```

- **Prázdný výstup** → spusť server v background:
  ```bash
  cd C:/Users/hejna/source/Stickman && python -m http.server 8000
  ```
- **Něco poslouchá** → OK, nic nedělej.

V obou případech vypiš: **Server běží: http://localhost:8000/**

Pokud spuštění selže, vypiš chybu a vyzvi uživatele, ať server spustí ručně.

---

## `@END` — ukončení sezení

Uzavíráme sezení na Stickman.

**(1.) Dokumentace** — důsledně všechny dotčené soubory:
- `TODO.md` — aktualizuj `[x]` / `[~]` / `[ ]`, přidej nové úkoly.
- `DONE.md` — přesuň hotové z TODO; stručně co se udělalo.
- `DIARY.md` — přidej řádek do indexu (datum + shrnutí).
- `docs/diary/YYYY-MM-DD.md` — vytvoř nebo doplň záznam: *Diskuse*, *Rozhodnutí*, *Kód*, *Kudos/Censure*, *Příště*. Pokud dnes už soubor existuje (více sezení za den), přidej `## Sezení N` sekci — **nikdy** suffix `b`/`c`/`d`.
- `GLOSSARY.md` — doplň nové termíny.
- `IDEAS.md` — raw nápady; značky `→ TODO` / `→ DONE` u dozralých.
- `README.md`, `CLAUDE.md`, `PROMPTS.md` — jen pokud se přímo dotýkají dnešní práce.

**(2.) Kód:**
- Žádné `console.log` / debug výpisy v `src/` (pokud nejsou záměrné).
- Žádné zakomentované bloky kódu.
- **Grep po rename** — pokud sezení zahrnovalo přejmenování:
  ```bash
  grep -rn "STARÝ_NÁZEV" src/ demos/ *.md *.html
  ```

**(3.) Memory (auto memory):**
Zkontroluj, jestli ze sezení vzešly nové trvalé poznatky (preference, změny konceptu, referenční odkazy) — ulož do `C:\Users\hejna\.claude\projects\C--Users-hejna-source-Stickman\memory\` podle pravidel auto memory.

**(4.) Permission cleanup:**
- Zkontroluj `~/.claude/settings.json` a `~/.claude/settings.local.json` — najdi jednorázové, úzké Bash/MCP patterny (konkrétní příkazy s escapovanými závorkami, specifické cesty k souborům atd.).
- Konsoliduj na široké wildcard patterny (`Bash(git *)`, `Bash(curl *)`, `Bash(node -e:*)`, …) tam, kde to dává smysl.
- Pokud existuje široký pattern, smaž všechny úzké, které pokrývá (jinak hromadí balast).
- Cíl: méně permission promptů v dalším sezení. Konzervativně — neodstraňuj patterny, jejichž scope si nejsi jistý.

**(5.) Git:**
- Navrhni commit message (stručná, výstižná, česky) — formát např. `F2.2 Sezení N — krátký popis`.
- Commit na větev `main`.
- `git push` (remote = `origin/main`).

**Co jsme dnes udělali:**
[Stručný výčet z konverzace — 3–6 bodů.]

---

*(Soubor průběžně rozšiřován o další makra, až budou potřeba.)*
