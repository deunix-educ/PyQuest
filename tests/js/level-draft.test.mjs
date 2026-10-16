// Modèle de l'éditeur : aller-retour exact sur tous les niveaux, nettoyage des champs vides, YAML valide
// (rechargeable, conforme au schéma, et accepté par scripts/validate_levels.py).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';
import yaml from '../../app/js/lib/js-yaml/js-yaml.mjs';
import { LevelLinter } from '../../app/js/core/LevelLinter.js';
import { emptyLevelModel, fromLevel, levelFromYaml, levelToYaml, newStepModel, newTestModel, toLevel } from '../../app/js/author/LevelDraft.js';

const root = new URL('../../', import.meta.url).pathname;
const ids = readdirSync(`${root}levels`).filter((name) => /^\d\d-/.test(name));
const load = (id) => yaml.load(readFileSync(`${root}levels/${id}/level.yaml`, 'utf8'));
const linter = new LevelLinter(JSON.parse(readFileSync(`${root}levels/schema/level.schema.json`, 'utf8')));
const tmp = mkdtempSync(join(tmpdir(), 'pyquest-draft-'));

// --- Aller-retour exact sur tous les niveaux, et YAML exporté rechargeable à l'identique.
for (const id of ids) {
    const level = load(id);
    assert.deepEqual(toLevel(fromLevel(level)), level, `${id} : aller-retour modèle`);
    const source = levelToYaml(toLevel(fromLevel(level)));
    assert.deepEqual(levelFromYaml(source), level, `${id} : aller-retour YAML`);
    assert.ok(!/\t/.test(source), `${id} : pas de tabulation`);
    const file = join(tmp, `${id}.yaml`);
    writeFileSync(file, source);
    // Le validateur Python de la CI accepte exactement ce que l'éditeur exporte.
    const output = execFileSync('python3', ['-I', '-c', `
import sys, json
sys.path.insert(0, ${JSON.stringify(`${root}scripts`)})
import validate_levels as v
schema = json.load(open(${JSON.stringify(`${root}levels/schema/level.schema.json`)}))
print(v.validate_level(__import__('pathlib').Path(${JSON.stringify(file)}), schema, True, check_folder=False))`], { encoding: 'utf8' });
    assert.equal(output.trim(), '[]', `${id} : validate_levels.py`);
}

// --- Un niveau vide, une fois rempli à minima, est conforme (sauf traductions et solutions à compléter).
const model = emptyLevelModel();
model.id = '99-essai';
model.title = { fr: 'Essai', en: 'Test' };
model.steps = [newStepModel('explain'), newStepModel('code')];
model.steps[0].text = { fr: 'Texte', en: 'Text' };
model.steps[1].instruction = { fr: 'Fais ceci', en: 'Do this' };
model.steps[1].solution = 'print("x")';
model.steps[1].tests = [{ ...newTestModel('stdout_equals'), value: 'x\n' }];
model.steps[1].hints = { fr: 'Un indice\n\n  Deux  \n', en: 'A hint\nTwo' };
model.mission.title = { fr: 'M', en: 'M' };
model.mission.goal = { fr: 'But', en: 'Goal' };
const level = toLevel(model);
assert.deepEqual(linter.lint(level, { knownLevelIds: ids }).filter((p) => p.severity === 'error'), []);

// --- Nettoyage : champs facultatifs vides omis, ordre des clés stable.
assert.deepEqual(Object.keys(level), ['id', 'title', 'difficulty', 'xp', 'requires', 'steps', 'mission']);
assert.deepEqual(Object.keys(level.steps[0]), ['type', 'voice', 'text']);
assert.deepEqual(Object.keys(level.steps[1]), ['type', 'starter', 'instruction', 'tests', 'hints', 'solution']);
assert.deepEqual(level.steps[1].hints, { fr: ['Un indice', 'Deux'], en: ['A hint', 'Two'] }, 'lignes vides retirées, espaces rognés');
assert.deepEqual(Object.keys(level.mission), ['title', 'goal', 'reward_sound']);
model.steps[1].hints = { fr: '', en: '' };
assert.equal('hints' in toLevel(model).steps[1], false);
model.steps[0].voice = false; model.steps[0].image = '  img.png ';
assert.deepEqual(toLevel(model).steps[0], { type: 'explain', text: { fr: 'Texte', en: 'Text' }, image: 'img.png' });
model.steps[0].text.en = '';
assert.deepEqual(toLevel(model).steps[0].text, { fr: 'Texte' }, 'en vide omis (signalé ensuite par le linter)');

// --- Tests typés et saisies scriptées.
const typed = (valueType, value) => toLevel({ ...model, steps: [{ ...model.steps[1], tests: [{ ...newTestModel('var_equals'), name: 'x', valueType, value }] }] }).steps[0].tests[0].value;
assert.equal(typed('number', '2.5'), 2.5);
assert.equal(typed('number', 'abc'), 'abc', 'nombre invalide conservé tel quel (le linter/validation le signalera)');
assert.equal(typed('boolean', 'true'), true);
assert.equal(typed('text', '12'), '12');
const withInputs = toLevel({ ...model, steps: [{ ...model.steps[1], tests: [{ ...newTestModel('stdout_contains'), value: 'a', inputs: 'x\n\ny\n\n' }] }] }).steps[0].tests[0];
assert.deepEqual(withInputs.inputs, ['x', '', 'y'], 'ligne vide du milieu conservée, finales ignorées');
assert.deepEqual(Object.keys(toLevel({ ...model, steps: [{ ...model.steps[1], tests: [newTestModel('no_syntax_error')] }] }).steps[0].tests[0]), ['kind']);

// --- Le compactage des listes ne touche jamais au contenu des blocs littéraux (code avec une ligne « - »).
model.steps[1].starter = 'x = 1\n-\n- item\n    -\n';
model.steps[1].solution = '-\nprint("ok")';
const exported = toLevel(model);
assert.deepEqual(levelFromYaml(levelToYaml(exported)), exported, 'blocs littéraux préservés');

console.log('level draft ok');
