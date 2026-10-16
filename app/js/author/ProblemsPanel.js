// Panneau des vérifications : problèmes triés par gravité, chacun avec un bouton « aller au champ ».
// Les textes viennent des catalogues (clés `lint.<code>`) ; les paramètres sont complétés ici.

import { el } from '../ui/dom.js';

const ORDER = { error: 0, warning: 1, info: 2 };
const ICONS = { error: '✘', warning: '⚠', info: 'ℹ' };

/** « Étape 3 › Test 1 › value » à partir du chemin d'un problème. */
export function describePath(path, t) {
    const parts = [];
    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        if (segment === 'steps' && typeof path[i + 1] === 'number') {
            parts.push(t('author.path.step', { n: path[++i] + 1 }));
        } else if (segment === 'tests' && typeof path[i + 1] === 'number') {
            parts.push(t('author.path.test', { n: path[++i] + 1 }));
        } else if (segment === 'mission') {
            parts.push(t('author.path.mission'));
        } else if (typeof segment === 'number') {
            parts.push(`#${segment + 1}`);
        } else {
            parts.push(segment);
        }
    }
    return parts.join(' › ');
}

/** Texte complet d'un problème, paramètres de présentation inclus. */
export function describeProblem(problem, t) {
    const params = { ...problem.params };
    if (Array.isArray(params.failures)) {
        params.failures = params.failures.map((failure) => `${t(`author.kind.${failure.kind}`)} (${t(`reason.${failure.reason}`)})`).join(' ; ');
    }
    if (params.line) {
        params.line = ` (${t('cell.line', { line: params.line })})`;
    } else if ('line' in params) {
        params.line = '';
    }
    return t(`lint.${problem.code}`, params);
}

export class ProblemsPanel {
    #t;
    #root;
    #onGoto;

    /** @param {{t: Function, onGoto: (path: (string|number)[]) => void}} options */
    constructor({ t, onGoto }) {
        this.#t = t;
        this.#onGoto = onGoto;
        this.#root = el('div', { class: 'problems', role: 'region', 'aria-live': 'polite' });
    }

    get element() {
        return this.#root;
    }

    /** @param {{severity: string, code: string, path: (string|number)[], params: object}[]} problems */
    render(problems) {
        const t = this.#t;
        const sorted = [...problems].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
        const count = (severity) => problems.filter((problem) => problem.severity === severity).length;
        const summary = el('p', { class: 'problems-summary', text: problems.length === 0 ? t('author.problems.none') : t('author.problems.summary', { errors: count('error'), warnings: count('warning'), infos: count('info') }) });
        const items = sorted.map((problem) =>
            el(
                'li',
                { class: `problem problem-${problem.severity}` },
                el('span', { class: 'problem-icon', 'aria-hidden': 'true', text: ICONS[problem.severity] }),
                el(
                    'div',
                    { class: 'problem-body' },
                    el('strong', { class: 'problem-severity', text: t(`author.severity.${problem.severity}`) }),
                    ' ',
                    el('span', { class: 'problem-text', text: describeProblem(problem, t) }),
                    problem.path.length > 0 ? el('div', { class: 'problem-path', text: describePath(problem.path, t) }) : null,
                ),
                problem.path.length > 0 ? el('button', { type: 'button', class: 'btn', text: t('author.problems.goto'), onclick: () => this.#onGoto(problem.path) }) : null,
            ),
        );
        this.#root.replaceChildren(summary, el('ul', { class: 'problem-list' }, ...items));
    }
}
