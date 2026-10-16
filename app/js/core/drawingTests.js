// Tests déclaratifs sur le dessin produit par `canvas.line` (kinds `drawing_*`).
// Les valeurs sont de simples chaînes pour rester éditables dans l'éditeur de niveaux :
//   drawing_segments : "4" (exactement 4 traits) ou "4+" (au moins 4)
//   drawing_has_line : "0,0 100,0" ou "0,0 100,0 red" (un trait entre ces deux points, dans un sens ou
//                      dans l'autre, éventuellement de cette couleur)
//   drawing_colors   : "red,blue" (toutes ces couleurs apparaissent dans le dessin)
// Un segment est [x1, y1, x2, y2, couleur] (coordonnées déjà arrondies à 0,01 par le module Python).

export const DRAWING_COLORS = ['black', 'red', 'green', 'blue', 'orange', 'purple', 'gray'];
const POINT_TOLERANCE = 0.5;

const NUMBER = '-?\\d+(?:\\.\\d+)?';
const SEGMENTS_PATTERN = /^(\d+)(\+?)$/;
const LINE_PATTERN = new RegExp(`^\\s*(${NUMBER}),(${NUMBER})\\s+(${NUMBER}),(${NUMBER})(?:\\s+([a-z]+))?\\s*$`);

/** @returns {{count: number, atLeast: boolean}|null} null si la valeur est mal formée. */
export function parseSegmentsSpec(value) {
    const match = SEGMENTS_PATTERN.exec(String(value ?? '').trim());
    return match ? { count: Number(match[1]), atLeast: match[2] === '+' } : null;
}

/** @returns {{from: number[], to: number[], color: string|null}|null} */
export function parseLineSpec(value) {
    const match = LINE_PATTERN.exec(String(value ?? ''));
    if (!match) {
        return null;
    }
    const [, x1, y1, x2, y2, color] = match;
    if (color !== undefined && !DRAWING_COLORS.includes(color)) {
        return null;
    }
    return { from: [Number(x1), Number(y1)], to: [Number(x2), Number(y2)], color: color ?? null };
}

/** @returns {string[]|null} */
export function parseColorsSpec(value) {
    const colors = String(value ?? '')
        .split(',')
        .map((color) => color.trim())
        .filter(Boolean);
    return colors.length > 0 && colors.every((color) => DRAWING_COLORS.includes(color)) ? colors : null;
}

const near = (a, b) => Math.abs(a[0] - b[0]) <= POINT_TOLERANCE && Math.abs(a[1] - b[1]) <= POINT_TOLERANCE;

/** Renvoie null si le test passe, sinon un code de raison traduit par l'interface. */
export function checkDrawing(test, drawing) {
    if (!Array.isArray(drawing)) {
        return 'drawing_missing';
    }
    if (test.kind === 'drawing_segments') {
        const spec = parseSegmentsSpec(test.value);
        if (!spec) {
            return 'invalid_test';
        }
        const ok = spec.atLeast ? drawing.length >= spec.count : drawing.length === spec.count;
        return ok ? null : spec.atLeast || drawing.length < spec.count ? 'drawing_too_few' : 'drawing_too_many';
    }
    if (test.kind === 'drawing_has_line') {
        const spec = parseLineSpec(test.value);
        if (!spec) {
            return 'invalid_test';
        }
        const found = drawing.some(([x1, y1, x2, y2, color]) => {
            const same = near([x1, y1], spec.from) && near([x2, y2], spec.to);
            const reversed = near([x1, y1], spec.to) && near([x2, y2], spec.from);
            return (same || reversed) && (spec.color === null || spec.color === color);
        });
        return found ? null : 'drawing_line_missing';
    }
    const colors = parseColorsSpec(test.value);
    if (!colors) {
        return 'invalid_test';
    }
    const used = new Set(drawing.map((segment) => segment[4]));
    return colors.every((color) => used.has(color)) ? null : 'drawing_color_missing';
}
