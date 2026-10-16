// Garde-fou d'accessibilité : lit app/css/themes.css et vérifie les rapports de contraste WCAG
// des jetons (clair et sombre) — texte courant ≥ 4,5 : 1, composants et focus ≥ 3 : 1.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const css = readFileSync(new URL('../../app/css/themes.css', import.meta.url), 'utf8');

/** Jetons d'un bloc de règles : { nom: '#rrggbb' }. */
function tokens(block) {
    return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const lightBlock = css.match(/:root \{([\s\S]*?)\n\}/)[1];
const darkBlock = css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1];
const autoDarkBlock = css.match(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n    \}/)[1];

function luminance(hex) {
    const channel = (offset) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const ratio = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
};

// Le thème sombre « automatique » (préférence système) et le sombre forcé doivent être identiques.
assert.deepEqual(tokens(autoDarkBlock), tokens(darkBlock), 'sombre auto ≠ sombre forcé');

const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };
const failures = [];
for (const [mode, c] of [['clair', light], ['sombre', dark]]) {
    const checks = [
        ['texte / fond', c.text, c.bg, 4.5],
        ['texte / surface', c.text, c.surface, 4.5],
        ['texte atténué / fond', c.muted, c.bg, 4.5],
        ['texte atténué / surface', c.muted, c.surface, 4.5],
        ['bouton principal', c['accent-text'], c.accent, 4.5],
        ['accent / fond (liens, cadre)', c.accent, c.bg, 3],
        ['focus / fond', c.focus, c.bg, 3],
        ['focus / surface', c.focus, c.surface, 3],
        ['XP (hl) / fond', c.hl, c.bg, 4.5],
        ['réussite / surface', c.ok, c.surface, 4.5],
        ['réussite / fond', c.ok, c.bg, 4.5],
        ['erreur / surface', c.ko, c.surface, 4.5],
        ['erreur / fond', c.ko, c.bg, 4.5],
        ['bordure / fond', c.border, c.bg, 1.5], // décorative : non exigée par WCAG pour du texte
        ...['keyword', 'string', 'number', 'comment', 'builtin', 'def'].map((name) => [`code ${name} / fond du code`, c[`tok-${name}`], c.code, 4.5]),
        ['code texte / fond du code', c.text, c.code, 4.5],
    ];
    for (const [label, foreground, background, minimum] of checks) {
        assert.ok(foreground && background, `jeton manquant pour « ${label} » (${mode})`);
        const value = ratio(foreground, background);
        if (value < minimum) failures.push(`${mode} · ${label} : ${value.toFixed(2)} < ${minimum}`);
    }
}
assert.deepEqual(failures, []);
console.log('theme contrast ok');
