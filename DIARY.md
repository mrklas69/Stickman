# DIARY — Stickman

Index pracovních sezení. Detaily jednotlivých sezení v `docs/diary/YYYY-MM-DD.md`.

Formát záznamu: **Diskuse · Rozhodnutí · Kód · Příště.**

## Sezení

- **2026-04-28** — [README, TODO, cíle C1+C2; hero GIF + repo publish; Pages live + plán druhé iterace dem; F1 hotová (Inspector + DebugView + lehové pose) + sjednocení joint=support; F2 prototyp (vrstva character/, Stickman wrapper, plynulé přechody); F1.6 Inspector dotažený (sekce POSTOJE/SEDY/KLEKY, 8 sed/klek pose, hip.y + shoulder.y DOF, slider proporcí) (Sezení 1-6)](docs/diary/2026-04-28.md)
- **2026-04-29** — [F1.7 uzavření iterace 01: refresh proporcí (biceps/předloktí ×0.95, stehno/lýtko ×1.05); 6 nových authored postojů (bow, arabesque, stretch, crow, bridge, headstand); 5 starých dem smazáno; sekce Ostatní + slidery proporcí + bottom panel toggles pryč; quint ease-out; Drift algoritmus zapsán do IDEAS jako kandidát na F2 STAND-idle (Sezení 7) · F2.1 Demo 02 přepsán podle vzoru Demo 01: 3-column layout, levý panel POSES (Reset/Dance/Drift) + STATUS (Walk/Jog/Sprint), pravý panel jen Neklid slider; animateRun + RUN_PRESETS (jog/sprint, sprint kalibrován s forwardLean 30° a kneeLift 150°); Drift implementován v animateStand idle (budget walk, rootRange 90°); Dance jako preset Status.STAND idle (cycleDuration 60/110, fraction 0.5, rootRange 8); Neklid jako globální overlay v src/util/Neklid.js (sin per-osa, deterministický hash, level 0-10 → max 5°/4°); bug fix skeleton.reset() v procedurálních animacích (Sezení 8)](docs/diary/2026-04-29.md)
