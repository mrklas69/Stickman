// src/util/DemoUI.js
// =============================================================================
// Helpery pro UI v demech: slidery, toggly, button groups.
// Eliminuje boilerplate (~30–50 řádků na demo).
//
// Konvence: každá funkce přijímá DOM container (parent) a vrací rozhraní pro
// další manipulaci (např. set value, get state).
// =============================================================================

/**
 * Přidá slider s label, range a hodnotou. Volá onChange při každé změně.
 *
 * @param {HTMLElement} parent - kam vložit (obvykle div s třídou "panel")
 * @param {object} opts
 * @param {string} opts.label   - text vlevo
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {number} opts.step
 * @param {number} opts.value   - počáteční hodnota
 * @param {string} [opts.unit=''] - např. '°', 's', 'Hz' (zobrazí se za hodnotou)
 * @param {function(number)} opts.onChange - callback s novou hodnotou
 * @returns {{ row, input, valueEl, set(v) }}
 */
export function addSlider(parent, { label, min, max, step, value, unit = '', onChange }) {
    const row = document.createElement('div');
    row.className = 'duip-field';
    const decimals = step < 1 ? 1 : 0;
    row.innerHTML = `
        <label>${label}</label>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
        <span class="duip-value">${value.toFixed(decimals)}${unit}</span>
    `;
    const input = row.querySelector('input');
    const valueEl = row.querySelector('.duip-value');
    input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        valueEl.textContent = v.toFixed(decimals) + unit;
        onChange(v);
    });
    parent.appendChild(row);
    // Dodatečné API pro programatické nastavení (např. při resetu)
    return {
        row, input, valueEl,
        set(v) {
            input.value = v;
            valueEl.textContent = v.toFixed(decimals) + unit;
        },
    };
}

/**
 * Přidá toggle (LED + label). Klik přepíná stav, volá onChange(bool).
 *
 * @param {HTMLElement} parent
 * @param {object} opts
 * @param {string} opts.label
 * @param {boolean} opts.value - výchozí stav
 * @param {function(boolean)} opts.onChange
 * @returns {{ row, isOn(), set(bool) }}
 */
export function addToggle(parent, { label, value, onChange }) {
    const row = document.createElement('div');
    row.className = 'duip-toggle' + (value ? ' on' : '');
    row.innerHTML = `<div class="duip-led"></div><span>${label}</span>`;
    let state = value;
    row.addEventListener('click', () => {
        state = !state;
        row.classList.toggle('on', state);
        onChange(state);
    });
    parent.appendChild(row);
    return {
        row,
        isOn: () => state,
        set(v) {
            state = !!v;
            row.classList.toggle('on', state);
        },
    };
}

/**
 * Přidá skupinu tlačítek pro výběr jedné hodnoty (jako radio group, ale jako tlačítka).
 *
 * @param {HTMLElement} parent
 * @param {Array<{key, label}>} items - tlačítka
 * @param {function(string)} onSelect - callback s klíčem vybraného
 * @param {string} [activeKey] - výchozí aktivní klíč
 * @returns {{ buttons, activate(key) }}
 */
export function addButtonGroup(parent, items, onSelect, activeKey = null) {
    const buttons = {};
    items.forEach(({ key, label }) => {
        const btn = document.createElement('button');
        btn.className = 'duip-button';
        btn.textContent = label;
        btn.addEventListener('click', () => activate(key));
        parent.appendChild(btn);
        buttons[key] = btn;
    });
    function activate(key) {
        for (const k in buttons) buttons[k].classList.toggle('active', k === key);
        onSelect(key);
    }
    if (activeKey) activate(activeKey);
    return { buttons, activate };
}

/**
 * Přidá panel (div s třídou) — kontejner pro slidery/toggly.
 * Vrátí parent element, do kterého následně helpery přidávají řádky.
 *
 * @param {HTMLElement|string} containerOrId - rodič nebo ID elementu
 * @param {string} [title] - volitelný h3 titulek nahoře
 */
export function addPanel(containerOrId, title = null) {
    const container = typeof containerOrId === 'string'
        ? document.getElementById(containerOrId)
        : containerOrId;
    if (title) {
        const h = document.createElement('h3');
        h.className = 'duip-h3';
        h.textContent = title;
        container.appendChild(h);
    }
    return container;
}

/**
 * CSS, které se má jednou injectnout do <head> pro stylování DemoUI prvků.
 * Volat injectStyles() v každém demu (idempotentní — vícekrát volat OK).
 */
let _stylesInjected = false;
export function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const css = `
        .duip-h3 { margin: 0 0 10px 0; color: #ffaa66; font-size: 0.95em; }
        .duip-field { display: flex; align-items: center; margin: 6px 0; gap: 10px; font-size: 0.85em; }
        .duip-field label { width: 90px; }
        .duip-field input[type=range] { flex: 1; min-width: 0; accent-color: #ffaa66; }
        .duip-value { width: 60px; font-family: monospace; color: #88ccff; text-align: right; }
        .duip-toggle { display: flex; align-items: center; gap: 8px; margin: 8px 0;
                       cursor: pointer; user-select: none; font-size: 0.85em; }
        .duip-led { width: 12px; height: 12px; border-radius: 50%;
                    background: #444; border: 1px solid #666; }
        .duip-toggle.on .duip-led { background: #44ff66; border-color: #44ff66;
                                     box-shadow: 0 0 6px #44ff66; }
        .duip-button { padding: 10px 18px; background: #2a2a35; color: #ddd;
                       border: 1px solid #444; border-radius: 6px; cursor: pointer;
                       font-size: 1em; min-width: 160px; text-align: left; margin-bottom: 4px; }
        .duip-button:hover  { background: #3a3a45; }
        .duip-button.active { background: #ffaa66; color: #1a1a22; border-color: #ffaa66; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}
