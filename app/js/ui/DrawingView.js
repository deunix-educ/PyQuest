// Feuille de dessin d'une cellule : affiche les traits produits par `canvas.line`.
// Le <canvas> est une image (role="img") dotée d'une description textuelle, et la liste des traits est
// disponible en texte : rien n'est transmis par la seule couleur ni par la seule image.

import { el } from './dom.js';

export const SIZE = 400; // repère logique : -200..200 dans les deux sens, origine au centre, y vers le haut
const HALF = SIZE / 2;
const LISTED_SEGMENTS = 50;

// Teintes choisies pour rester lisibles sur la feuille blanche (la feuille ne suit pas le thème sombre).
const COLORS = { black: '#111111', red: '#c62828', green: '#2e7d32', blue: '#1565c0', orange: '#e65100', purple: '#6a1b9a', gray: '#616161' };
const fmt = (n) => String(Math.round(n * 100) / 100);

/** Description textuelle du dessin (pure, testable sans navigateur). */
export function describeDrawing(segments, t) {
    if (segments.length === 0) {
        return t('drawing.alt.empty');
    }
    const used = [...new Set(segments.map((segment) => segment[4]))].map((color) => t(`drawing.color.${color}`));
    return t('drawing.alt', { n: segments.length, colors: used.join(', ') });
}

/** Une ligne de texte par trait. */
export function describeSegment([x1, y1, x2, y2, color], t) {
    return t('drawing.segment', { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), color: t(`drawing.color.${color}`) });
}

export class DrawingView {
    #i18n;
    #root;
    #canvas;
    #list;
    #summary;

    /** @param {import('../i18n/i18n.js').I18n} i18n */
    constructor(i18n) {
        this.#i18n = i18n;
        this.#canvas = el('canvas', { class: 'drawing-canvas', width: SIZE, height: SIZE, role: 'img' });
        this.#summary = el('p', { class: 'drawing-summary' });
        this.#list = el('ul', { class: 'drawing-list' });
        this.#root = el(
            'figure',
            { class: 'cell-drawing', hidden: true },
            el('figcaption', { text: i18n.t('drawing.title') }),
            this.#canvas,
            this.#summary,
            el('details', {}, el('summary', { text: i18n.t('drawing.list') }), this.#list),
        );
    }

    get element() {
        return this.#root;
    }

    /** @param {Array<[number, number, number, number, string]>} segments */
    render(segments) {
        this.#root.hidden = segments.length === 0;
        const t = (key, params) => this.#i18n.t(key, params);
        const description = describeDrawing(segments, t);
        this.#canvas.setAttribute('aria-label', description);
        this.#summary.textContent = description;
        const shown = segments.slice(0, LISTED_SEGMENTS).map((segment) => el('li', { text: describeSegment(segment, t) }));
        if (segments.length > LISTED_SEGMENTS) {
            shown.push(el('li', { text: t('drawing.more', { n: segments.length - LISTED_SEGMENTS }) }));
        }
        this.#list.replaceChildren(...shown);
        this.#paint(segments);
    }

    clear() {
        this.render([]);
    }

    #paint(segments) {
        const context = this.#canvas.getContext('2d');
        if (!context) {
            return; // la description textuelle reste disponible
        }
        context.clearRect(0, 0, SIZE, SIZE);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, SIZE, SIZE);
        // Repère discret : quadrillage tous les 50 et axes.
        context.lineWidth = 1;
        for (let v = -HALF; v <= HALF; v += 50) {
            context.strokeStyle = v === 0 ? '#9e9e9e' : '#e0e0e0';
            context.beginPath();
            context.moveTo(HALF + v, 0);
            context.lineTo(HALF + v, SIZE);
            context.moveTo(0, HALF - v);
            context.lineTo(SIZE, HALF - v);
            context.stroke();
        }
        context.lineWidth = 3;
        context.lineCap = 'round';
        for (const [x1, y1, x2, y2, color] of segments) {
            context.strokeStyle = COLORS[color] ?? COLORS.black;
            context.beginPath();
            context.moveTo(HALF + x1, HALF - y1);
            context.lineTo(HALF + x2, HALF - y2);
            context.stroke();
        }
    }
}
