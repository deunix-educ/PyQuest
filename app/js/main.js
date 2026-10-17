// Point d'entrée : assemble les modules et branche l'interface.

import { AudioEngine } from './core/AudioEngine.js';
import { ErrorTranslator } from './core/ErrorTranslator.js';
import { GuideEngine } from './core/GuideEngine.js';
import { LessonEngine } from './core/LessonEngine.js';
import { IndexedDbKeyValueStore, MemoryKeyValueStore } from './core/KeyValueStores.js';
import { ProgressStore } from './core/ProgressStore.js';
import { PyodideWorkerClient } from './core/PyodideWorkerClient.js';
import { SettingsStore } from './core/SettingsStore.js';
import { OfflineVoices } from './core/OfflineVoices.js';
import { SyncClient } from './core/SyncClient.js';
import { ValidationEngine } from './core/ValidationEngine.js';
import { VoiceEngine } from './core/VoiceEngine.js';
import { I18n } from './i18n/i18n.js';
import { speechKey } from './core/speechKey.js';
import { BadgeShelf } from './ui/BadgeShelf.js';
import { BadgeToast } from './ui/BadgeToast.js';
import { Drawer } from './ui/Drawer.js';
import { el } from './ui/dom.js';
import { CellManager } from './ui/CellManager.js';
import { NotebookView } from './ui/NotebookView.js';
import { ProgressMap } from './ui/ProgressMap.js';
import { AboutPanel, COPYRIGHT_YEAR } from './ui/AboutPanel.js';
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
    root.dataset.guide = settings.guideEnabled ? 'on' : 'off';
}

class App {
    #i18n;
    #settings;
    #progress;
    #sync;
    #offlineVoices;
    #voicesDownload = null;
    #lessons;
    #audio;
    #voice;
    #manager;
    #toast;
    #notebook;
    #map;
    #shelf;
    #panel;
    #about;
    #aboutDrawer;
    #levelsDrawer;
    #settingsDrawer;
    #levelIds = [];
    #currentId = null;

    async run() {
        const store = await openStore();
        this.#settings = new SettingsStore(store);
        const settings = await this.#settings.load();

        const [translations, errorCatalogs, guideCatalogs] = await Promise.all([
            Promise.all(LANGUAGES.map((lang) => loadJson(`./i18n/${lang}.json`))),
            Promise.all(LANGUAGES.map((lang) => loadJson(`./i18n/errors.${lang}.json`))),
            Promise.all(LANGUAGES.map((lang) => loadJson(`./i18n/guide.${lang}.json`))),
        ]);
        this.#i18n = new I18n(Object.fromEntries(LANGUAGES.map((lang, i) => [lang, translations[i]])), settings.lang);
        const guide = new GuideEngine(Object.fromEntries(LANGUAGES.map((lang, i) => [lang, guideCatalogs[i]])));
        const translator = new ErrorTranslator(Object.fromEntries(LANGUAGES.map((lang, i) => [lang, errorCatalogs[i]])));

        this.#progress = new ProgressStore(store);
        await this.#progress.load();
        // Synchronisation facultative : l'API est sur le même domaine (nginx), sinon l'état « indisponible » s'affiche.
        this.#sync = new SyncClient({ store, progress: this.#progress, endpoint: new URL('api/sync/', document.baseURI).href });
        await this.#sync.load();
        this.#lessons = new LessonEngine({ levelsUrl: new URL('/levels/', location.href).href });
        this.#offlineVoices = new OfflineVoices({ levelsUrl: new URL('/levels/', location.href).href });
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
            guide,
        });
        this.#manager.addEventListener('levelcomplete', () => this.#renderMap());

        this.#map = new ProgressMap(this.#i18n);
        this.#shelf = new BadgeShelf(this.#i18n);
        this.#map.addEventListener('select', (event) => {
            this.#levelsDrawer.close();
            this.#goTo(event.detail.id);
        });
        this.#about = new AboutPanel(this.#i18n);
        this.#panel = new SettingsPanel(this.#i18n);
        this.#panel.setSync(this.#sync.state);
        this.#panel.addEventListener('change', (event) => this.#onSettingChange(event.detail));
        this.#panel.addEventListener('test', (event) => this.#onTest(event.detail.kind));
        this.#panel.addEventListener('sync', (event) => this.#onSync(event.detail));
        this.#sync.addEventListener('change', (event) => this.#panel.setSync(event.detail));
        this.#sync.addEventListener('merged', () => this.#renderMap());
        this.#panel.addEventListener('voices', () => this.#downloadVoices());
        this.#panel.addEventListener('export', () => this.#exportProgress());
        this.#panel.addEventListener('import', (event) => this.#importProgress(event.detail.file));

        document.getElementById('notebook-region').append(notebook.element);
        document.getElementById('toast-region').append(toast.element);
        this.#buildDrawers();
        this.#bindLevelNav();

        applySettings(settings);
        this.#renderChrome();

        this.#levelIds = (await this.#lessons.listLevels()).map((level) => level.id);
        // Lien direct (#/levels/05-decide) ; sinon premier niveau non terminé, ou le dernier si tout est fait.
        const requested = this.#levelFromHash();
        const next = requested ?? this.#levelIds.find((id) => !this.#progress.isCompleted(id)) ?? this.#levelIds.at(-1);
        history.replaceState(null, '', `#/levels/${next}`);
        window.addEventListener('popstate', () => this.#openLevel(this.#levelFromHash() ?? this.#levelIds[0]));
        // Retour après une pause (2 jours ou plus sans activité) : accueil bienveillant, sans reproche.
        await this.#openLevel(next, { greeting: this.#isReturning() ? 'welcome_back' : 'level_start' });
        this.#registerServiceWorker();
        this.#refreshVoiceStatus();
        // Synchronisation (si activée) : au démarrage, au retour du réseau et quand l'onglet redevient visible.
        this.#sync.start();
        window.addEventListener('online', () => this.#sync.sync());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.#sync.sync();
            }
        });
    }

    /** Vrai si l'apprenant a déjà de l'activité mais pas depuis au moins deux jours. */
    #isReturning() {
        const { lastDay } = this.#progress.snapshot().streak;
        if (!lastDay) {
            return false;
        }
        const [year, month, day] = lastDay.split('-').map(Number);
        const now = new Date();
        const days = (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / 86400000;
        return days >= 2;
    }

    /** Id de niveau demandé par l'URL (#/levels/<id>), s'il existe. */
    #levelFromHash() {
        const match = /^#\/levels\/([a-z0-9-]+)$/.exec(location.hash);
        return match && this.#levelIds.includes(match[1]) ? match[1] : null;
    }

    /** Ouvre un niveau en ajoutant une entrée d'historique (retour arrière du navigateur utilisable). */
    async #goTo(id) {
        if (!this.#levelIds.includes(id)) {
            return;
        }
        if (this.#levelFromHash() !== id) {
            history.pushState(null, '', `#/levels/${id}`);
        }
        await this.#openLevel(id);
    }

    async #openLevel(id, { greeting = 'level_start' } = {}) {
        this.#currentId = id;
        await this.#renderMap();
        const session = await this.#lessons.startLevel(id, this.#i18n.lang);
        this.#updateLevelNav(session.title);
        await this.#manager.start(session, { greeting });
        this.#prefetchLevelVoices(id);
    }

    async #renderMap() {
        const levels = await Promise.all(
            this.#levelIds.map(async (id) => {
                const level = await this.#lessons.loadLevel(id);
                return { id, title: level.title[this.#i18n.lang] ?? level.title.fr };
            }),
        );
        const progress = this.#progress.snapshot();
        this.#map.render({ levels, progress, currentId: this.#currentId });
        this.#shelf.render({ ids: ProgressStore.badgeIds, earned: progress.badges });
    }

    /** Tiroirs « Niveaux » (gauche) et « Réglages » (droite) ; un seul ouvert à la fois. */
    #buildDrawers() {
        const appRoot = document.getElementById('app-root');
        const region = document.getElementById('drawer-region');
        this.#levelsDrawer = new Drawer({
            side: 'left',
            title: '',
            closeLabel: '',
            content: el('div', { class: 'progress-drawer' }, this.#map.element, this.#shelf.element),
            trigger: document.getElementById('levels-toggle'),
            inertTargets: [appRoot],
        });
        this.#settingsDrawer = new Drawer({
            side: 'right',
            title: '',
            closeLabel: '',
            content: this.#panel.element,
            trigger: document.getElementById('settings-toggle'),
            inertTargets: [appRoot],
        });
        this.#aboutDrawer = new Drawer({
            side: 'right',
            title: '',
            closeLabel: '',
            content: this.#about.element,
            trigger: document.getElementById('about-toggle'),
            inertTargets: [appRoot],
        });
        region.append(...this.#levelsDrawer.elements, ...this.#settingsDrawer.elements, ...this.#aboutDrawer.elements);
        this.#levelsDrawer.addEventListener('open', () => {
            this.#settingsDrawer.close({ restoreFocus: false });
            this.#aboutDrawer.close({ restoreFocus: false });
            this.#map.scrollToCurrent();
        });
        this.#settingsDrawer.addEventListener('open', () => {
            this.#levelsDrawer.close({ restoreFocus: false });
            this.#aboutDrawer.close({ restoreFocus: false });
        });
        this.#aboutDrawer.addEventListener('open', () => {
            this.#levelsDrawer.close({ restoreFocus: false });
            this.#settingsDrawer.close({ restoreFocus: false });
        });
    }

    #bindLevelNav() {
        const step = (offset) => this.#goTo(this.#levelIds[this.#levelIds.indexOf(this.#currentId) + offset]);
        document.getElementById('level-prev').addEventListener('click', () => step(-1));
        document.getElementById('level-next').addEventListener('click', () => step(1));
    }

    /** Titre du niveau courant et boutons précédent/suivant. */
    #updateLevelNav(title) {
        const index = this.#levelIds.indexOf(this.#currentId);
        const label = this.#i18n.t('nav.level', { n: index + 1, total: this.#levelIds.length });
        document.getElementById('level-current').textContent = `${label} · ${title}`;
        document.getElementById('level-prev').disabled = index <= 0;
        document.getElementById('level-next').disabled = index >= this.#levelIds.length - 1;
    }

    #renderChrome() {
        const t = (key) => this.#i18n.t(key);
        document.getElementById('app-title').textContent = t('app.title');
        document.getElementById('app-tagline').textContent = t('app.tagline');
        document.title = t('app.docTitle');
        document.getElementById('footer-copyright').textContent = this.#i18n.t('footer.copyright', { year: COPYRIGHT_YEAR });
        document.getElementById('footer-license').textContent = t('footer.license');
        document.getElementById('about-toggle').textContent = t('footer.about');
        document.getElementById('levels-toggle').replaceChildren(el('span', { 'aria-hidden': 'true', text: '☰ ' }), t('nav.levels'));
        document.getElementById('settings-toggle').replaceChildren(el('span', { 'aria-hidden': 'true', text: '⚙ ' }), t('nav.settings'));
        document.getElementById('level-prev').setAttribute('aria-label', t('nav.prev'));
        document.getElementById('level-next').setAttribute('aria-label', t('nav.next'));
        document.getElementById('level-nav').setAttribute('aria-label', t('nav.label'));
        this.#levelsDrawer?.setTitle(t('progress.title'));
        this.#levelsDrawer?.setCloseLabel(t('nav.close'));
        this.#aboutDrawer?.setTitle(t('about.title'));
        this.#aboutDrawer?.setCloseLabel(t('nav.close'));
        this.#about.render();
        this.#settingsDrawer?.setTitle(t('settings.title'));
        this.#settingsDrawer?.setCloseLabel(t('nav.close'));
        this.#panel.render(this.#settings.settings);
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
            this.#panel.focusSetting('lang');
            // Le niveau courant redémarre dans la nouvelle langue (les saisies en cours sont perdues).
            await this.#openLevel(this.#currentId);
        }
    }

    /** Nombre de narrations déjà disponibles hors ligne dans la langue courante (affiché dans les réglages). */
    async #refreshVoiceStatus() {
        const supported = this.#offlineVoices.supported && this.#voice.supported;
        if (!supported) {
            this.#panel.setVoices({ supported: false });
            return;
        }
        const { total, cached } = await this.#offlineVoices.status(this.#levelIds, this.#i18n.lang);
        this.#panel.setVoices({ supported: true, total, cached, running: false, message: '' });
    }

    /** Télécharge toutes les narrations de la langue courante pour une écoute hors ligne. */
    async #downloadVoices() {
        if (this.#voicesDownload) {
            return;
        }
        const lang = this.#i18n.lang;
        this.#voicesDownload = true;
        this.#panel.setVoices({ running: true, done: 0, message: '' });
        try {
            const result = await this.#offlineVoices.download(this.#levelIds, lang, {
                onProgress: (done, total) => this.#panel.setVoices({ running: true, done, total }),
            });
            const message = result.failed > 0 ? this.#i18n.t('voices.failed', { failed: result.failed }) : this.#i18n.t('voices.done');
            await this.#refreshVoiceStatus();
            this.#panel.setVoices({ message });
        } finally {
            this.#voicesDownload = null;
        }
    }

    /** Précharge discrètement la narration du niveau ouvert : elle sera lisible hors ligne, sans action de l'apprenant. */
    #prefetchLevelVoices(id) {
        // Économie de données demandée par le navigateur : on ne télécharge rien sans clic.
        if (navigator.connection?.saveData || !this.#offlineVoices.supported || !this.#voice.supported) {
            return;
        }
        this.#offlineVoices.download([id], this.#i18n.lang).then(() => this.#refreshVoiceStatus()).catch(() => {});
    }

    async #onSync({ action, token }) {
        const t = (key) => this.#i18n.t(key);
        const say = (key) => this.#panel.setSync(this.#sync.state, key ? t(key) : '');
        if (action === 'enable') {
            const result = await this.#sync.enable();
            say(result.ok ? 'sync.enabled' : '');
        } else if (action === 'link') {
            try {
                const result = await this.#sync.link(token);
                say(result.ok ? 'sync.linked' : '');
            } catch {
                say('sync.invalidToken');
            }
        } else if (action === 'now') {
            await this.#sync.sync();
            say('');
        } else if (action === 'disable' || action === 'erase') {
            const result = await this.#sync.disable({ eraseRemote: action === 'erase' });
            if (result.ok) {
                say(action === 'erase' ? 'sync.erased' : 'sync.disabled');
            } else {
                this.#panel.setSync(this.#sync.state, t(`sync.error.${result.code}`));
            }
        } else if (action === 'copy') {
            try {
                await navigator.clipboard.writeText(this.#sync.state.token);
                say('sync.copied');
            } catch {
                // Pas d'API presse-papiers (http, autorisation refusée) : la copie manuelle reste possible.
                say('sync.copyFailed');
            }
        }
    }

    /** Télécharge la progression en JSON (Blob + lien temporaire : API standard, sans serveur). */
    #exportProgress() {
        const blob = new Blob([this.#progress.export()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = el('a', { href: url, download: `pyquest-progress-${ProgressStore.dayKey(new Date())}.json` });
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.#toast.show(this.#i18n.t('backup.exported'));
    }

    /** Fusionne un fichier de progression (union : on ne perd jamais rien). */
    async #importProgress(file) {
        try {
            const result = await this.#progress.import(await file.text());
            await this.#renderMap();
            this.#toast.show(this.#i18n.t('backup.imported', { n: result.addedLevels }));
        } catch {
            this.#toast.show(this.#i18n.t('backup.importFailed'));
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
