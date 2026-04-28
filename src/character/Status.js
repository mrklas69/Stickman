// src/character/Status.js
// =============================================================================
// Status = enum stavů postavy. Co postava právě "dělá" v daném okamžiku.
//
// Použití:
//   import { Status } from './Status.js';
//   stickman.setStatus(Status.WALK);
//
// Object.freeze() = zamrazí objekt (žádné nové vlastnosti, žádné přepsání).
// Default v JS by jinak dovolil `Status.WALK = 'lol'` — Freeze tomu zabrání.
//
// Hodnoty jsou stringy (ne čísla) — usnadňuje debug v konzoli a serializaci.
// =============================================================================

export const Status = Object.freeze({
    STAND: 'stand',          // klidné stání v rest pose
    SIT:   'sit',            // sed
    WALK:  'walk',           // chůze (cyklický pohyb nohou)
    RUN:   'run',            // běh (rychlejší + s let-fází)
    SWIM:  'swim',           // plavání (root rotnut k horizontále)
    CLIMB: 'climb',          // šplh (ruce + nohy nahoru)
    JUMP:  'jump',           // výskok (prep → air → land)
    LAY:   'lay',            // lehy (statické, varianty)
    SLEEP: 'sleep',          // spánek (lay + drobné dechové oscilace)
    DANCE: 'dance',          // tanec (rytmus + variace)
});
