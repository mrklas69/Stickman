# IDEAS — Stickman

Raw nápady, které ještě nejsou připravené k realizaci. Jakmile dozrají, posunout do `TODO.md` se značkou `→ TODO`.

## Snap algoritmus — surface-aligned snap *(Sezení 4)*

Aktuální snap: lineární `min Y joint → floor` + translate. Ignoruje fakt, že pose může mít několik contact bodů na různých Y (= tělo nakloněné, jeden bod doráží na podlahu, ostatní visí nad).

**Idea:** najít rovinu procházející hlavními contact body a pose se na ni „položí" (= translation + rotation tak, aby tato rovina = floor plane).

### Subvarianty

- **(a) Tripod (= 3 nejnižší)**: vyber 3 body s nejmenším Y, vyrob trojúhelník, rotuj pose aby normála trojúhelníka = +Y. ✗ Edge case: stand pose (3. nejnižší = koleno, pose by se naklonila dopředu). Ne univerzální.
- **(b) Surface fit přes všechny contact body**: aproximuj rovinu přes všechny joints s Y blízko nejnižšího (= dynamic contact body z `getSupportPoints`). Pak rotuj pose tak, aby tato rovina = floor.
- **(c) Per-pose flag `autoLevel: true/false`**: opt-in pro user-authored pose, off pro library presety s explicitní `rootRotation`.

### Otevřené

- Konflikt s explicitní `rootRotation` v pose (např. layBack má `rotationX = 90°` záměrně)
- Edge cases: 3 body kolineární, 4+ bodů ne v rovině (= ill-posed plane fit)
- Computational cost při transition (= rotace přepočítaná každý frame při lerp)

### Status

Odložené. Aktuální algoritmus + manuální `rootRotation` v pose stačí. Posun do TODO až bude konkrétní use case (např. user-authored pose v Inspectoru, kde modelář nechce ručně počítat rotaci).

→ kandidát: po F2 nebo F3, pokud uživatelské pose authoring bude časté.

## Foot-on-floor IK *(Sezení 4)*

Když pose má pokrčená kolena ale ankle by měl být na podlaze, manuální výpočet `hip.x + knee.x + hip.z` je tricky (geometrie složitá). 1-shot IK by mohl: zafixovat ankle world Y na floor, vypočítat hip + knee úhly, zachovat ostatní pose.

`solveTwoBoneIK` v `src/model/IK.js` už řeší 2-bone IK pro paže/nohy. Mohl by být volaný z Inspector tlačítkem „Spustit nohy na podlahu" — pro každou nohu udělá IK target = floor pod hipem.

### Status

Možná užitečné pro user-authored lehové pose. Posunout do TODO pokud se bude opakovaně řešit.

## Pose authoring v UI místo JSON

Aktuálně user vyrobí pose v Inspectoru přes slidery → Copy JSON → AI / manuální vložení do `library/Poses.js`. Plně UI cesta:

- Tlačítko „Save as preset" v Inspectoru → modal s názvem → uloží do localStorage / soubor
- Sekce „Custom" v levém panelu (mimo LEHY/Ostatní) — uživatelské uložené pose

### Status

Rozumné rozšíření. Posunout do TODO až bude pose library větší (= user chce vlastní organizaci).
