// Éditeur de niveaux (mode auteur) : formulaires, vérifications en direct, exécution des solutions avec le
// vrai Python, essai comme apprenant, export YAML. Aucun serveur : tout se passe dans le navigateur.

import { AudioEngine } from '../core/AudioEngine.js';
import { ErrorTranslator } from '../core/ErrorTranslator.js';
import { GuideEngine } from '../core/GuideEngine.js';
import { LevelChecker } from '../core/LevelChecker.js';
import { LevelSession } from '../core/LevelSession.js';
import { MemoryKeyValueStore } from '../core/KeyValueStores.js';
import { ProgressStore } from '../core/ProgressStore.js';
import { PyodideWorkerClient } from '../core/PyodideWorkerClient.js';
import { ValidationEngine } from '../core/ValidationEngine.js';
import { BadgeToast } from '../ui/BadgeToast.js';
import { CellManager } from '../ui/CellManager.js';
import { NotebookView } from '../ui/NotebookView.js';
import { el } from '../ui/dom.js';
import { LevelForm } from './LevelForm.js';
import { emptyLevelModel, fromLevel, levelFromYaml, levelToYaml, toLevel } from './LevelDraft.js';
import { ProblemsPanel } from './ProblemsPanel.js';

const DEBOUNCE_MS = 250;
const DRAFT_KEY = 'draft';

export class AuthorApp {
    #i18n;
    #linter;
    #lessons;
    #store;
    #catalogs;
    #root;
    #knownIds = [];
    #model = emptyLevelModel();
    #loadedId = null;
    #form = null;
    #problemsPanel = null;
    #staticProblems = [];
    #checkProblems = null;
    #timer = null;
    #status = null;
    #yamlView = null;
    #manifestView = null;
    #checkButton = null;
    #checkStatus = null;
    #runtime = null;
    #previewHost = null;
    #keepNotice = false; // garde « brouillon restauré » affiché malgré le premier enregistrement

    /**
     * @param {object} deps
     * @param {import('../i18n/i18n.js').I18n} deps.i18n  Catalogue fusionné (application + auteur).
     * @param {import('../core/LevelLinter.js').LevelLinter} deps.linter
     * @param {import('../core/LessonEngine.js').LessonEngine} deps.lessons
     * @param {{get: Function, set: Function}} deps.store  Magasin des brouillons.
     * @param {{errors: object, guide: object}} deps.catalogs  Catalogues d'erreurs et du guide, par langue (pour l'essai).
     * @param {HTMLElement} deps.root
     */
    constructor({ i18n, linter, lessons, store, catalogs, root }) {
        this.#i18n = i18n;
        this.#linter = linter;
        this.#lessons = lessons;
        this.#store = store;
        this.#catalogs = catalogs;
        this.#root = root;
    }

    async run() {
        this.#knownIds = (await this.#lessons.listLevels()).map((level) => level.id);
        const draft = await this.#store.get(DRAFT_KEY).catch(() => undefined);
        if (draft) {
            this.#model = draft;
            this.#loadedId = draft.id && this.#knownIds.includes(draft.id) ? draft.id : null;
        }
        this.#i18n.addEventListener('change', () => this.#build());
        this.#keepNotice = Boolean(draft);
        this.#build();
        if (draft) {
            this.#setStatus(this.#i18n.t('author.status.draft_restored'));
        }
    }

    // ---- Construction de l'interface -----------------------------------------------------------------------

    #t = (key, params) => this.#i18n.t(key, params);

    #build() {
        const t = this.#t;
        this.#form = new LevelForm({ t, model: this.#model, knownIds: this.#knownIds, onChange: () => this.#changed() });
        this.#problemsPanel = new ProblemsPanel({ t, onGoto: (path) => this.#form.focusPath(path) });
        this.#status = el('p', { class: 'author-status', role: 'status' });
        this.#root.replaceChildren(
            el('a', { class: 'skip-link', href: '#author-main', text: t('author.skip') }),
            this.#header(),
            el('main', { id: 'author-main', class: 'author-layout' }, el('div', { class: 'author-form' }, this.#form.element), el('aside', { class: 'author-side' }, this.#sidePanels())),
        );
        this.#refresh();
    }

    #header() {
        const t = this.#t;
        const languages = el(
            'select',
            { id: 'author-lang', 'aria-label': t('author.language'), onchange: (event) => this.#i18n.setLang(event.target.value) },
            ...this.#i18n.languages.map((lang) => el('option', { value: lang, text: lang.toUpperCase(), selected: lang === this.#i18n.lang })),
        );
        const loader = el('select', { id: 'author-load-select', 'aria-label': t('author.toolbar.load_select') }, ...this.#knownIds.map((id) => el('option', { value: id, text: id, selected: id === this.#loadedId })));
        const fileInput = el('input', { id: 'author-file', type: 'file', accept: '.yaml,.yml,text/yaml', class: 'sr-only', onchange: (event) => this.#importFile(event.target.files[0]) });
        return el(
            'header',
            { class: 'author-header' },
            el('div', { class: 'brand' }, el('img', { src: 'icons/icon.svg', alt: '', width: 32, height: 32 }), el('h1', { text: t('author.title') })),
            el(
                'div',
                { class: 'author-toolbar', role: 'toolbar', 'aria-label': t('author.toolbar.label') },
                el('button', { type: 'button', class: 'btn', id: 'author-new', text: t('author.toolbar.new'), onclick: () => this.#newLevel() }),
                loader,
                el('button', { type: 'button', class: 'btn', id: 'author-load', text: t('author.toolbar.load'), onclick: () => this.#loadFromSite(loader.value) }),
                el('label', { class: 'btn', for: 'author-file', text: t('author.toolbar.import') }),
                fileInput,
                el('button', { type: 'button', class: 'btn btn-primary', id: 'author-download', text: t('author.toolbar.download'), onclick: () => this.#download() }),
                languages,
                el('a', { class: 'btn', href: './', text: t('author.toolbar.back') }),
            ),
            this.#status,
        );
    }

    #sidePanels() {
        const t = this.#t;
        this.#checkButton = el('button', { type: 'button', class: 'btn', id: 'author-check', text: t('author.check.run'), onclick: () => this.#runChecks() });
        this.#checkStatus = el('p', { class: 'field-help', role: 'status' });
        this.#yamlView = el('textarea', { id: 'author-yaml', class: 'mono', readonly: true, rows: 14, wrap: 'off', 'aria-label': t('author.export.yaml') });
        this.#manifestView = el('pre', { class: 'mono', id: 'author-manifest' });
        this.#previewHost = el('div', { class: 'preview-host' });
        return [
            el('section', { class: 'side-section', 'aria-labelledby': 'side-problems' }, el('h2', { id: 'side-problems', text: t('author.section.problems') }), this.#problemsPanel.element),
            el('section', { class: 'side-section', 'aria-labelledby': 'side-check' }, el('h2', { id: 'side-check', text: t('author.section.check') }), el('p', { class: 'field-help', text: t('author.check.help') }), this.#checkButton, this.#checkStatus),
            el(
                'section',
                { class: 'side-section', 'aria-labelledby': 'side-preview' },
                el('h2', { id: 'side-preview', text: t('author.section.preview') }),
                el('p', { class: 'field-help', text: t('author.preview.help') }),
                el('button', { type: 'button', class: 'btn', id: 'author-preview', text: t('author.preview.start'), onclick: () => this.#startPreview() }),
                this.#previewHost,
            ),
            el(
                'section',
                { class: 'side-section', 'aria-labelledby': 'side-export' },
                el('h2', { id: 'side-export', text: t('author.section.export') }),
                el('ol', { class: 'export-steps' }, ...[1, 2, 3, 4, 5].map((n) => el('li', { text: t(`author.export.step${n}`) }))),
                el('p', { class: 'field-help', text: t('author.export.manifest') }),
                this.#manifestView,
                el('details', {}, el('summary', { text: t('author.export.yaml') }), this.#yamlView),
            ),
        ];
    }

    // ---- Modèle et vérifications ---------------------------------------------------------------------------

    #changed() {
        this.#checkProblems = null; // résultats d'exécution périmés
        this.#checkStatus && (this.#checkStatus.textContent = '');
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.#refresh(), DEBOUNCE_MS);
    }

    /** Recalcule vérifications statiques, export et brouillon. */
    #refresh() {
        const level = toLevel(this.#model);
        // En modification d'un niveau existant, son propre id n'est pas un doublon.
        const known = this.#model.id === this.#loadedId ? this.#knownIds.filter((id) => id !== this.#loadedId) : this.#knownIds;
        this.#staticProblems = this.#linter.lint(level, { knownLevelIds: known });
        this.#problemsPanel.render([...this.#staticProblems, ...(this.#checkProblems ?? [])]);
        this.#yamlView.value = levelToYaml(level);
        const requires = JSON.stringify(level.requires);
        this.#manifestView.textContent = `{ "id": ${JSON.stringify(level.id)}, "requires": ${requires} }`;
        this.#store
            .set(DRAFT_KEY, this.#model)
            .then(() => {
                if (this.#keepNotice) {
                    this.#keepNotice = false;
                    return;
                }
                this.#setStatus(this.#t('author.status.saved', { time: new Date().toLocaleTimeString(this.#i18n.lang) }));
            })
            .catch(() => {});
    }

    #setStatus(text) {
        this.#status.textContent = text;
    }

    #setModel(model, loadedId = null) {
        this.#model = model;
        this.#loadedId = loadedId;
        this.#checkProblems = null;
        this.#build();
    }

    // ---- Actions de la barre d'outils ----------------------------------------------------------------------

    #newLevel() {
        if (window.confirm(this.#t('author.confirm.new'))) {
            this.#setModel(emptyLevelModel());
        }
    }

    async #loadFromSite(id) {
        if (!window.confirm(this.#t('author.confirm.load', { id }))) {
            return;
        }
        this.#setModel(fromLevel(await this.#lessons.loadLevel(id)), id);
        this.#setStatus(this.#t('author.status.loaded', { id }));
    }

    async #importFile(file) {
        if (!file) {
            return;
        }
        try {
            const level = levelFromYaml(await file.text());
            if (level === null || typeof level !== 'object' || Array.isArray(level)) {
                throw new Error('not a mapping');
            }
            this.#setModel(fromLevel(level), null);
            this.#setStatus(this.#t('author.status.imported', { name: file.name }));
        } catch (error) {
            this.#setStatus(this.#t('author.status.import_error', { detail: error.message }));
        }
    }

    #download() {
        const level = toLevel(this.#model);
        const blob = new Blob([levelToYaml(level)], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const link = el('a', { href: url, download: 'level.yaml' });
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        const errors = this.#staticProblems.filter((problem) => problem.severity === 'error').length;
        this.#setStatus(errors > 0 ? this.#t('author.status.downloaded_with_errors', { count: errors }) : this.#t('author.status.downloaded', { id: level.id }));
    }

    // ---- Exécution (Python) --------------------------------------------------------------------------------

    /** Client Python et, pour l'essai, le même assemblage que l'application (progression en mémoire). */
    async #getRuntime() {
        if (this.#runtime) {
            return this.#runtime;
        }
        const i18n = this.#i18n;
        const client = new PyodideWorkerClient({ indexURL: new URL('/vendor/pyodide/', location.href).href });
        const validator = new ValidationEngine();
        const progress = new ProgressStore(new MemoryKeyValueStore());
        await progress.load();
        const notebook = new NotebookView(i18n);
        const toast = new BadgeToast(i18n);
        const manager = new CellManager({
            i18n,
            notebook,
            client,
            validator,
            translator: new ErrorTranslator(this.#catalogs.errors),
            audio: new AudioEngine({ enabled: false }),
            progress,
            toast,
            guide: new GuideEngine(this.#catalogs.guide),
        });
        this.#runtime = { client, checker: new LevelChecker({ client, validator }), manager, notebook, toast };
        return this.#runtime;
    }

    async #runChecks() {
        const t = this.#t;
        const level = toLevel(this.#model);
        const structural = this.#staticProblems.some((problem) => problem.severity === 'error' && problem.code.startsWith('schema_'));
        if (structural) {
            this.#checkStatus.textContent = t('author.check.fix_structure');
            return;
        }
        this.#checkButton.disabled = true;
        this.#checkStatus.textContent = t('author.check.starting');
        try {
            const { checker } = await this.#getRuntime();
            const { exercises, problems } = await checker.check(level, {
                onProgress: (done, total) => (this.#checkStatus.textContent = t('author.check.progress', { done, total })),
            });
            this.#checkProblems = problems;
            this.#problemsPanel.render([...this.#staticProblems, ...problems]);
            this.#checkStatus.textContent = problems.some((problem) => problem.severity === 'error') ? t('author.check.failed', { count: exercises.length }) : t('author.check.passed', { count: exercises.length });
        } catch {
            this.#checkStatus.textContent = t('engine.failed');
        } finally {
            this.#checkButton.disabled = false;
        }
    }

    async #startPreview() {
        const t = this.#t;
        const structural = this.#staticProblems.some((problem) => problem.severity === 'error' && problem.code.startsWith('schema_'));
        if (structural) {
            this.#previewHost.replaceChildren(el('p', { class: 'field-help', text: t('author.check.fix_structure') }));
            return;
        }
        const runtime = await this.#getRuntime();
        this.#previewHost.replaceChildren(el('div', { class: 'preview-frame' }, runtime.notebook.element), runtime.toast.element);
        const session = new LevelSession(toLevel(this.#model), this.#i18n.lang, new URL('./', location.href).href);
        await runtime.manager.start(session);
    }
}
