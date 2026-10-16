// Champs de formulaire accessibles de l'éditeur de niveaux : chaque champ a un label, un repère
// `data-path` (même chemin que les problèmes du linter, pour « aller au champ ») et notifie le modèle.

import { el, uniqueId } from '../ui/dom.js';

function wrap(label, control, help) {
    const helpId = help ? `${control.id}-help` : null;
    if (helpId) {
        control.setAttribute('aria-describedby', helpId);
    }
    return el('div', { class: 'field' }, el('label', { for: control.id, text: label }), control, help ? el('p', { class: 'field-help', id: helpId, text: help }) : null);
}

/** Champ texte sur une ligne ou zone de texte (code : police à chasse fixe, sans retour à la ligne automatique). */
export function textField({ label, path, value, onInput, multiline = false, rows = 3, code = false, help = null, type = 'text' }) {
    const control = multiline
        ? el('textarea', { id: uniqueId('f'), rows, class: code ? 'mono' : null, wrap: code ? 'off' : null, spellcheck: code ? 'false' : null })
        : el('input', { id: uniqueId('f'), type, class: code ? 'mono' : null });
    control.dataset.path = path;
    control.value = value;
    control.addEventListener('input', () => onInput(control.value));
    return wrap(label, control, help);
}

export function selectField({ label, path, value, options, onChange, help = null }) {
    const control = el('select', { id: uniqueId('f') }, ...options.map(([optionValue, text]) => el('option', { value: optionValue, text, selected: optionValue === value })));
    control.dataset.path = path;
    control.addEventListener('change', () => onChange(control.value));
    return wrap(label, control, help);
}

export function numberField({ label, path, value, min, max, onInput, help = null }) {
    const control = el('input', { id: uniqueId('f'), type: 'number', min, max, step: 1 });
    control.dataset.path = path;
    control.value = String(value);
    control.addEventListener('input', () => onInput(control.value === '' ? 0 : Number(control.value)));
    return wrap(label, control, help);
}

export function checkboxField({ label, path, checked, onChange, help = null }) {
    const control = el('input', { id: uniqueId('f'), type: 'checkbox', checked });
    control.dataset.path = path;
    control.addEventListener('change', () => onChange(control.checked));
    const helpId = help ? `${control.id}-help` : null;
    if (helpId) {
        control.setAttribute('aria-describedby', helpId);
    }
    return el('div', { class: 'field field-check' }, control, el('label', { for: control.id, text: label }), help ? el('p', { class: 'field-help', id: helpId, text: help }) : null);
}

/**
 * Paire de champs français / anglais pour un texte traduit. `value` est { fr, en } et est modifié en place.
 * `path` est le chemin de l'objet i18n (ex. 'title') ; les champs sont repérés par `${path}.fr` et `${path}.en`.
 */
export function i18nPair({ label, path, value, onChange, multiline = false, rows = 3, code = false, help = null }) {
    const make = (lang, langLabel) =>
        textField({
            label: `${label} — ${langLabel}`,
            path: `${path}.${lang}`,
            value: value[lang],
            multiline,
            rows,
            code,
            help: lang === 'fr' ? help : null,
            onInput: (text) => {
                value[lang] = text;
                onChange();
            },
        });
    return el('div', { class: 'i18n-pair' }, make('fr', 'Français'), make('en', 'English'));
}
