// Coloration syntaxique Python minimale, sans dépendance : découpe le code en jetons typés.
// Tolérante (jamais d'exception sur du code incomplet) et sans perte : la concaténation des
// textes des jetons redonne exactement le code d'entrée.

const KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
    'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

const BUILTINS = new Set([
    'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter', 'float', 'input', 'int', 'isinstance', 'len', 'list',
    'map', 'max', 'min', 'open', 'print', 'range', 'reversed', 'round', 'set', 'sorted', 'str', 'sum', 'tuple', 'type', 'zip',
]);

// Ordre des alternatives = priorité : commentaire, chaîne triple, chaîne simple, nombre, identifiant, autre.
// Les rétro-références comptent aussi les groupes nommés : \3 = guillemets triples, \5 = guillemet simple.
const TOKEN = new RegExp(
    [
        String.raw`(?<comment>#[^\n]*)`,
        String.raw`(?<triple>(?:[rRuUbBfF]{0,2})("""|''')[\s\S]*?(?:\3|$))`,
        String.raw`(?<string>(?:[rRuUbBfF]{0,2})(["'])(?:\\.|(?!\5)[^\\\n])*(?:\5|(?=\n)|$))`,
        String.raw`(?<number>\d+(?:_\d+)*(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)`,
        String.raw`(?<identifier>[A-Za-z_À-ÿ][\wÀ-ÿ]*)`,
        String.raw`(?<other>[\s\S])`,
    ].join('|'),
    'y',
);

/**
 * @param {string} code
 * @returns {{type: 'keyword'|'string'|'number'|'comment'|'builtin'|'def'|'text', text: string}[]}
 */
export function tokenizePython(code) {
    const tokens = [];
    let expectName = false; // vrai juste après `def` ou `class` : le prochain identifiant est un nom défini
    TOKEN.lastIndex = 0;
    while (TOKEN.lastIndex < code.length) {
        const match = TOKEN.exec(code);
        const { comment, triple, string, number, identifier } = match.groups;
        let type = 'text';
        if (comment !== undefined) {
            type = 'comment';
        } else if (triple !== undefined || string !== undefined) {
            type = 'string';
        } else if (number !== undefined) {
            type = 'number';
        } else if (identifier !== undefined) {
            if (KEYWORDS.has(identifier)) {
                type = 'keyword';
                expectName = identifier === 'def' || identifier === 'class';
            } else {
                type = expectName ? 'def' : BUILTINS.has(identifier) ? 'builtin' : 'text';
                expectName = false;
            }
        }
        // Les espaces entre `def` et le nom ne rompent pas l'attente ; tout autre jeton la rompt.
        if (identifier === undefined && !/^\s+$/.test(match[0])) {
            expectName = false;
        }
        // Fusionne les jetons « texte » adjacents pour limiter le nombre de nœuds.
        const last = tokens.at(-1);
        if (type === 'text' && last?.type === 'text') {
            last.text += match[0];
        } else {
            tokens.push({ type, text: match[0] });
        }
    }
    return tokens;
}
