// Panneau de réglages : accessible au clavier, chaque champ a un label visible.
// Émet 'change' (detail: { key, value }) et 'test' (detail: { kind: 'sound' | 'voice' }) ;
// l'application persiste, applique, et joue les échantillons.

import { el, uniqueId } from './dom.js';

export class SettingsPanel extends EventTarget {
    #i18n;
    #root;

    /** @param {import('../i18n/i18n.js').I18n} i18n */
    constructor(i18n) {
        super();
        this.#i18n = i18n;
        this.#root = el('section', { class: 'settings', 'aria-label': i18n.t('settings.title') });
    }

    get element() {
        return this.#root;
    }

    /** @param {import('../core/SettingsStore.js').DEFAULT_SETTINGS} settings */
    render(settings) {
        const t = (key) => this.#i18n.t(key);
        this.#root.replaceChildren(
            this.#field('settings.language', 'select', {
                value: settings.lang,
                options: this.#i18n.languages.map((lang) => [lang, lang.toUpperCase()]),
                key: 'lang',
            }),
            this.#field('settings.fontSize', 'range', { value: settings.fontSize, min: 80, max: 200, step: 10, key: 'fontSize', number: true }),
            this.#field('settings.theme', 'select', {
                value: settings.theme,
                options: ['auto', 'light', 'dark'].map((theme) => [theme, t(`settings.theme.${theme}`)]),
                key: 'theme',
            }),
            this.#field('settings.guide', 'checkbox', { value: settings.guideEnabled, key: 'guideEnabled' }),
            this.#field('settings.sound', 'checkbox', { value: settings.soundEnabled, key: 'soundEnabled' }),
            this.#testButton('settings.testSound', 'sound'),
            this.#field('settings.volume', 'range', { value: settings.volume, min: 0, max: 1, step: 0.1, key: 'volume', number: true }),
            this.#field('settings.voice', 'checkbox', { value: settings.voiceEnabled, key: 'voiceEnabled' }),
            this.#testButton('settings.testVoice', 'voice'),
            this.#field('settings.voiceRate', 'range', { value: settings.voiceRate, min: 0.5, max: 2, step: 0.1, key: 'voiceRate', number: true }),
            this.#field('settings.author', 'checkbox', { value: settings.authorMode, key: 'authorMode' }),
            this.#backupSection(),
            settings.authorMode ? el('a', { class: 'btn author-link', href: 'author.html', text: t('settings.authorOpen') }) : null,
        );
    }

    /** Redonne le focus à un réglage après un nouveau rendu (ex. changement de langue). */
    focusSetting(key) {
        this.#root.querySelector(`[data-setting="${key}"]`)?.focus();
    }

    /** Sauvegarde manuelle de la progression : fichier JSON, sans serveur. */
    #backupSection() {
        const t = (key) => this.#i18n.t(key);
        const fileId = uniqueId('import');
        const input = el('input', {
            id: fileId,
            type: 'file',
            accept: 'application/json,.json',
            hidden: true,
            onchange: (event) => {
                const [file] = event.target.files;
                event.target.value = '';
                if (file) {
                    this.dispatchEvent(new CustomEvent('import', { detail: { file } }));
                }
            },
        });
        return el(
            'fieldset',
            { class: 'setting-group' },
            el('legend', { text: t('backup.title') }),
            el('p', { class: 'hint', text: t('backup.help') }),
            el('button', { type: 'button', class: 'btn', text: t('backup.export'), onclick: () => this.dispatchEvent(new Event('export')) }),
            el('button', { type: 'button', class: 'btn', text: t('backup.import'), onclick: () => input.click() }),
            input,
        );
    }

    #testButton(labelKey, kind) {
        const button = el('button', {
            type: 'button',
            class: 'btn',
            text: this.#i18n.t(labelKey),
            onclick: () => this.dispatchEvent(new CustomEvent('test', { detail: { kind } })),
        });
        return el('div', { class: 'setting' }, button);
    }

    #field(labelKey, kind, { value, options = [], key, number = false, ...range }) {
        const id = uniqueId('setting');
        const emit = (newValue) => this.dispatchEvent(new CustomEvent('change', { detail: { key, value: newValue } }));
        let control;
        if (kind === 'select') {
            control = el(
                'select',
                { id, onchange: (event) => emit(event.target.value) },
                ...options.map(([optionValue, text]) => el('option', { value: optionValue, text, selected: optionValue === value })),
            );
        } else if (kind === 'checkbox') {
            control = el('input', { id, type: 'checkbox', checked: value, onchange: (event) => emit(event.target.checked) });
        } else {
            control = el('input', { id, type: 'range', value, ...range, onchange: (event) => emit(number ? Number(event.target.value) : event.target.value) });
        }
        control.dataset.setting = key;
        return el('div', { class: 'setting' }, el('label', { for: id, text: this.#i18n.t(labelKey) }), control);
    }
}
