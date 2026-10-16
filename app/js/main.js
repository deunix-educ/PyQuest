// Point d'entrée : assemble les modules et branche l'interface.

import { AudioEngine } from './core/AudioEngine.js';
import { ErrorTranslator } from './core/ErrorTranslator.js';
import { LessonEngine } from './core/LessonEngine.js';
import { IndexedDbKeyValueStore, MemoryKeyValueStore } from './core/KeyValueStores.js';
import { ProgressStore } from './core/ProgressStore.js';
import { PyodideWorkerClient } from './core/PyodideWorkerClient.js';
import { SettingsStore } from './core/SettingsStore.js';
import { ValidationEngine } from './core/ValidationEngine.js';
import { VoiceEngine } from './core/VoiceEngine.js';
import { I18n } from './i18n/i18n.js';
import { speechKey } from './core/speechKey.js';
import { BadgeToast } from './ui/BadgeToast.js';
import { CellManager } from './ui/CellManager.js';
import { NotebookView } from './ui/NotebookView.js';
import { ProgressMap } from './ui/ProgressMap.js';
import { SettingsPanel } from './ui/SettingsPanel.js';

const LANGUAGES = ['fr', 'en'];

async function loadJson(path) {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) {
        throw new Error(`Cannot load ${path}`);
    }
    return response.json();
}

/** IndexedDB si utilisable (refusé en navigation privée sur certains navigateurs), sinon mémoire. */
async function openStore() {
    try {
        const store = new IndexedDbKeyValueStore();
        await store.get('probe');
        return store;
    } catch {
        return new MemoryKeyValueStore();
    }
}

function applySettings(settings) {
    const root = document.documentElement;
    root.style.setProperty('--font-scale', String(settings.fontSize / 100));
    if (settings.theme === 'auto') {
        root.removeAttribute('data-theme');
    } else {
        root.setAttribute('data-theme', settings.theme);
    }
    root.lang = settings.lang;
}

class App {
    #i18n;
    #settings;
    #progress;
    #lessons;
    #audio;
    #voice;
    #manager;
    #toast;
    #notebook;
    #map;
    #panel;
    #levelIds = [];
    #currentId = null;

    async run() {
        const store = await openStore();
        this.#settings = new SettingsStore(store);
        const settings = await this.#settings.load();

        const [translations, errorCatalogs] = await Promise.all([
            Promise.all(LANGUAGES.map((lang) => loadJson(`./i18n/${lang}.json`))),
            Promise.all(LANGUAGES.map((lang) => loadJson(`./i18n/errors.${lang}.json`))),
        ]);
        this.#i18n = new I18n(Object.fromEntries(LANGUAGES.map((lang, i) => [lang, translations[i]])), settings.lang);
        const translator = new ErrorTranslator(Object.fromEntries(LANGUAGES.map((lang, i) => [lang, errorCatalogs[i]])));

        this.#progress = new ProgressStore(store);
        await this.#progress.load();
        this.#lessons = new LessonEngine({ levelsUrl: new URL('/levels/', location.href).href });
        this.#audio = new AudioEngine({ enabled: settings.soundEnabled, volume: settings.volume });
        this.#voice = new VoiceEngine({ enabled: settings.voiceEnabled, rate: settings.voiceRate });

        const client = new PyodideWorkerClient({ indexURL: new URL('/vendor/pyodide/', location.href).href });
        const notebook = new NotebookView(this.#i18n, {
            onSpeak: (text, step) => this.#speak(text, step.audioUrl),
            canSpeak: () => this.#voice.supported && this.#voice.enabled,
        });
        this.#notebook = notebook;
        const toast = new BadgeToast(this.#i18n);
        this.#toast = toast;
        this.#manager = new CellManager({
            i18n: this.#i18n,
            notebook,
            client,
            validator: new ValidationEngine(),
            translator,
            audio: this.#audio,
            progress: this.#progress,
            toast,
        });
        this.#manager.addEventListener('levelcomplete', () => this.#renderMap());

        this.#map = new ProgressMap(this.#i18n);
        this.#map.addEventListener('select', (event) => this.#openLevel(event.detail.id));
        this.#panel = new SettingsPanel(this.#i18n);
        this.#panel.addEventListener('change', (event) => this.#onSettingChange(event.detail));
        this.#panel.addEventListener('test', (event) => this.#onTest(event.detail.kind));

        document.getElementById('progress-region').append(this.#map.element);
        document.getElementById('notebook-region').append(notebook.element);
        document.getElementById('settings-region').append(this.#panel.element);
        document.getElementById('toast-region').append(toast.element);
        this.#bindSettingsToggle();

        applySettings(settings);
        this.#renderChrome();

        this.#levelIds = (await this.#lessons.listLevels()).map((level) => level.id);
        // Premier niveau non terminé, ou le dernier si tout est fait.
        const next = this.#levelIds.find((id) => !this.#progress.isCompleted(id)) ?? this.#levelIds.at(-1);
        await this.#openLevel(next);
        this.#registerServiceWorker();
    }

    async #openLevel(id) {
        this.#currentId = id;
        await this.#renderMap();
        const session = await this.#lessons.startLevel(id, this.#i18n.lang);
        await this.#manager.start(session);
    }

    async #renderMap() {
        const levels = await Promise.all(
            this.#levelIds.map(async (id) => {
                const level = await this.#lessons.loadLevel(id);
                return { id, title: level.title[this.#i18n.lang] ?? level.title.fr };
            }),
        );
        this.#map.render({ levels, progress: this.#progress.snapshot(), currentId: this.#currentId });
    }

    #renderChrome() {
        const toggle = document.getElementById('settings-toggle');
        toggle.textContent = this.#i18n.t('settings.title');
        document.getElementById('app-title').textContent = this.#i18n.t('app.title');
        this.#panel.render(this.#settings.settings);
    }

    #bindSettingsToggle() {
        const toggle = document.getElementById('settings-toggle');
        const region = document.getElementById('settings-region');
        toggle.addEventListener('click', () => {
            const open = region.hidden;
            region.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
        });
    }

    async #onSettingChange({ key, value }) {
        await this.#settings.update(key, value);
        const settings = this.#settings.settings;
        applySettings(settings);
        this.#audio.setEnabled(settings.soundEnabled);
        this.#audio.setVolume(settings.volume);
        this.#voice.setEnabled(settings.voiceEnabled);
        this.#notebook.refreshVoiceButtons();
        this.#voice.setRate(settings.voiceRate);
        if (key === 'lang') {
            this.#i18n.setLang(value);
            this.#renderChrome();
            // Le niveau courant redémarre dans la nouvelle langue (les saisies en cours sont perdues).
            await this.#openLevel(this.#currentId);
        }
    }

    /** Échantillons des réglages : le clic est le geste utilisateur qui débloque le son. */
    async #onTest(kind) {
        if (kind === 'sound') {
            await this.#audio.unlock();
            this.#audio.play('success_big');
            return;
        }
        if (!this.#voice.enabled) {
            this.#toast.show(this.#i18n.t('settings.voiceOffNotice'));
            return;
        }
        const lang = this.#i18n.lang;
        const sample = this.#i18n.t('voice.sample');
        const audioUrl = new URL(`assets/voice/${lang}/${speechKey(lang, sample)}.mp3`, document.baseURI).href;
        await this.#speak(sample, audioUrl);
    }

    /** Lit un texte ; si rien ne peut être joué, prévient l'apprenant au lieu de rester silencieux. */
    async #speak(text, audioUrl) {
        await this.#voice.speak(text, this.#i18n.lang, { audioUrl });
        if (this.#voice.lastFailure) {
            this.#toast.show(this.#i18n.t('voice.failed'));
        }
    }

    #registerServiceWorker() {
        // Repli : sans service worker (http hors localhost, navigateur ancien), l'app fonctionne en ligne.
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js').catch(() => {});
        }
    }
}

new App().run().catch((error) => {
    document.getElementById('notebook-region').textContent = `PyQuest: ${error.message}`;
});
