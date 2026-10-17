// Panneau de réglages : accessible au clavier, chaque champ a un label visible.
// Émet 'change' (detail: { key, value }) et 'test' (detail: { kind: 'sound' | 'voice' }) ;
// l'application persiste, applique, et joue les échantillons.

import { el, uniqueId } from './dom.js';

export class SettingsPanel extends EventTarget {
    #i18n;
    #root;
    #syncRoot = el('fieldset', { class: 'setting-group sync-group' });
    #syncState = { enabled: false, token: null, status: 'off', error: null, lastSync: null };
    #syncMessage = '';
    #voicesRoot = el('fieldset', { class: 'setting-group voices-group' });
    #voicesState = { supported: false, total: 0, cached: 0, running: false, done: 0, message: '' };

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
            this.#voicesRoot,
            this.#field('settings.voiceRate', 'range', { value: settings.voiceRate, min: 0.5, max: 2, step: 0.1, key: 'voiceRate', number: true }),
            this.#field('settings.author', 'checkbox', { value: settings.authorMode, key: 'authorMode' }),
            this.#backupSection(),
            this.#syncRoot,
            settings.authorMode ? el('a', { class: 'btn author-link', href: 'author.html', text: t('settings.authorOpen') }) : null,
        );
        this.#renderSync();
        this.#renderVoices();
    }

    /** Met à jour la section « Voix hors ligne » (état du téléchargement des narrations). */
    setVoices(state) {
        this.#voicesState = { ...this.#voicesState, ...state };
        this.#renderVoices();
    }

    /** Met à jour la section de synchronisation (état du SyncClient ; `message` : résultat d'une action). */
    setSync(state, message = this.#syncMessage) {
        this.#syncState = state;
        this.#syncMessage = message;
        this.#renderSync();
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

    #renderVoices() {
        const t = (key, params) => this.#i18n.t(key, params);
        const state = this.#voicesState;
        if (!state.supported) {
            this.#voicesRoot.replaceChildren();
            this.#voicesRoot.hidden = true;
            return;
        }
        this.#voicesRoot.hidden = false;
        const focused = this.#voicesRoot.contains(document.activeElement);
        const status = state.running
            ? t('voices.downloading', { done: state.done, total: state.total })
            : t('voices.status', { cached: state.cached, total: state.total });
        const button = el('button', {
            type: 'button',
            class: 'btn',
            id: 'voices-download',
            disabled: state.running || (state.total > 0 && state.cached >= state.total),
            text: t('voices.download'),
            onclick: () => this.dispatchEvent(new Event('voices')),
        });
        this.#voicesRoot.replaceChildren(
            el('legend', { text: t('voices.title') }),
            el('p', { class: 'hint', text: t('voices.help') }),
            el('p', { class: 'voices-status', role: 'status', tabindex: '-1', text: status }),
            button,
            // Résultat du dernier téléchargement : annoncé aux lecteurs d'écran.
            el('p', { class: 'voices-message', role: 'status', text: state.message }),
        );
        if (focused) {
            // Le bouton se désactive quand tout est téléchargé : le focus passe alors à l'état, sans se perdre.
            (button.disabled ? this.#voicesRoot.querySelector('.voices-status') : button)?.focus();
        }
    }

    #renderSync() {
        const t = (key, params) => this.#i18n.t(key, params);
        const state = this.#syncState;
        const emit = (action, extra = {}) => this.dispatchEvent(new CustomEvent('sync', { detail: { action, ...extra } }));
        const button = (key, action, extra) => el('button', { type: 'button', class: 'btn', 'data-action': action, text: t(key), onclick: () => emit(action, extra) });
        const activeAction = this.#syncRoot.contains(document.activeElement) ? (document.activeElement.dataset.action ?? 'token') : null;
        const children = [el('legend', { text: t('sync.title') }), el('p', { class: 'hint', text: t('sync.help') })];

        if (!state.enabled) {
            const id = uniqueId('sync-token');
            const input = el('input', { id, type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'token-input' });
            children.push(
                button('sync.enable', 'enable'),
                el('div', { class: 'setting stacked' }, el('label', { for: id, text: t('sync.linkLabel') }), input),
                el('button', { type: 'button', class: 'btn', 'data-action': 'link', text: t('sync.link'), onclick: () => emit('link', { token: input.value }) }),
            );
        } else {
            const id = uniqueId('sync-mytoken');
            const when = state.lastSync ? new Date(state.lastSync).toLocaleString(this.#i18n.lang) : null;
            const status =
                state.status === 'syncing'
                    ? t('sync.status.syncing')
                    : state.status === 'error'
                      ? t(`sync.error.${state.error}`)
                      : when
                        ? t('sync.status.last', { when })
                        : t('sync.status.never');
            children.push(
                el('p', { class: 'sync-status', role: 'status', 'data-status': state.status, text: status }),
                el('div', { class: 'setting stacked' }, el('label', { for: id, text: t('sync.tokenLabel') }), el('input', { id, type: 'text', readonly: true, class: 'token-input', value: state.token })),
                el('p', { class: 'hint', text: t('sync.tokenHelp') }),
                button('sync.copy', 'copy'),
                button('sync.now', 'now'),
                button('sync.disable', 'disable'),
                button('sync.erase', 'erase'),
            );
        }
        // Résultat de la dernière action (copie, jeton invalide…) : annoncé aux lecteurs d'écran.
        children.push(el('p', { class: 'sync-message', role: 'status', text: this.#syncMessage }));
        this.#syncRoot.replaceChildren(...children);
        // Le rendu remplace les boutons : on redonne le focus à l'équivalent (ou au jeton) pour le clavier.
        if (activeAction) {
            (this.#syncRoot.querySelector(`[data-action="${activeAction}"]`) ?? this.#syncRoot.querySelector('.token-input'))?.focus();
        }
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
