import { ErrorTranslator } from '../../app/js/core/ErrorTranslator.js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert';
const d = new URL('../../app/js/i18n/', import.meta.url).pathname;
const fr = JSON.parse(readFileSync(d + 'errors.fr.json')), en = JSON.parse(readFileSync(d + 'errors.en.json'));
assert.deepEqual(Object.keys(fr), Object.keys(en));
for (const k of Object.keys(fr)) assert.deepEqual(Object.keys(fr[k]), ['title', 'explanation', 'tip']);
const t = new ErrorTranslator({ fr, en });
// Messages réels produits par CPython (version locale) pour valider les motifs.
const cases = ['print(nom)', 'print("a', 'print("a"', 'if x\n  pass', 'print "a"', '1+"a"', '"a"+1', '"a"()', 'int("abc")', 'float("x,y")', '[1][5]', '{}["k"]', '(1).foo', 'import nope', '1/0', 'if True:\npass', 'def f(a): pass\nf()', '2x', 'x = 1\ndef g():\n    print(x)\n    x = 2\ng()'];
const py = execFileSync('python3', ['-I', '-c', `
import json,sys
out=[]
for c in json.loads(sys.argv[1]):
    try: exec(compile(c,'<c>','exec'),{})
    except BaseException as e: out.append({'type':type(e).__name__,'message':str(e),'lineno':getattr(e,'lineno',None),'traceback':''})
print(json.dumps(out))`, JSON.stringify(cases)]);
for (const e of JSON.parse(py)) {
    const r = t.translate(e, 'fr');
    console.log(e.type.padEnd(20), '|', r.title);
    assert.ok(!/\{\w+\}/.test(r.title + r.explanation + r.tip), 'placeholder non résolu: ' + r.title);
}
assert.equal(t.translate({ type: 'NameError', message: "name 'nom' is not defined" }, 'en').title, 'Python doesn\'t know "nom"');
assert.equal(t.translate({ type: 'Weird', message: 'boom' }).title, 'Une erreur est survenue : Weird');
console.log('translator ok');
