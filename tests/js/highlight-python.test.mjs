// Le tokenizer de coloration est sans perte, tolérant, et classe correctement les cas courants.
import assert from 'node:assert';
import { tokenizePython } from '../../app/js/ui/highlightPython.js';

const join = (tokens) => tokens.map((token) => token.text).join('');
const typed = (code) => tokenizePython(code).filter((token) => token.type !== 'text').map((token) => `${token.type}:${token.text}`);

const samples = [
    'print("Bonjour", name)  # salut\n',
    "x = f'{a} é' + \"b\\\"c\"\n",
    'def add(a, b):\n    return a + b\n\nclass Foo:\n    pass',
    'total = 1_000 + 3.14e-2 + .5 + 0\n',
    '"""docstring\nsur deux lignes"""\n',
    'chaîne = "non fermée\nautre = 1',
    "'''triple non fermée",
    'if age >= 18 and not done:\n    print(True, None)',
    '',
    '\t  \n\n',
    'é = 1; ñ = "ü"',
];
for (const code of samples) {
    assert.equal(join(tokenizePython(code)), code, `sans perte : ${JSON.stringify(code)}`);
}

assert.deepEqual(typed('print("Bonjour", name)  # salut'), ['builtin:print', 'string:"Bonjour"', 'comment:# salut']);
assert.deepEqual(typed('def add(a, b):'), ['keyword:def', 'def:add']);
assert.deepEqual(typed('class  Foo:'), ['keyword:class', 'def:Foo']);
assert.deepEqual(typed('x = 3.14 + 1_000'), ['number:3.14', 'number:1_000']);
assert.deepEqual(typed('if a and not b: pass'), ['keyword:if', 'keyword:and', 'keyword:not', 'keyword:pass']);
assert.deepEqual(typed('# commentaire "pas une chaîne"'), ['comment:# commentaire "pas une chaîne"']);
assert.deepEqual(typed('"un # dans une chaîne"'), ['string:"un # dans une chaîne"']);
assert.deepEqual(typed("f'{x}'"), ["string:f'{x}'"]);
assert.deepEqual(typed('"""a\nb"""'), ['string:"""a\nb"""']);
assert.deepEqual(typed('while True:'), ['keyword:while', 'keyword:True']);
// Une chaîne non fermée s'arrête à la fin de la ligne : la suivante est colorée normalement.
assert.deepEqual(typed('s = "ouverte\ny = 2'), ['string:"ouverte', 'number:2']);
// Identifiant contenant un mot-clé : pas de faux positif.
assert.deepEqual(typed('printer = format_name'), []);
console.log('highlight ok');
