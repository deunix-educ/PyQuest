// Vérifications statiques : les vrais niveaux n'ont aucune erreur ; des niveaux fautifs fabriqués sont
// détectés avec le bon code, au bon endroit.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
import yaml from '../../app/js/lib/js-yaml/js-yaml.mjs';
import { LevelLinter } from '../../app/js/core/LevelLinter.js';

const root = new URL('../../', import.meta.url).pathname;
const schema = JSON.parse(readFileSync(`${root}levels/schema/level.schema.json`, 'utf8'));
const linter = new LevelLinter(schema);
const ids = readdirSync(`${root}levels`).filter((name) => /^\d\d-/.test(name));
const load = (id) => yaml.load(readFileSync(`${root}levels/${id}/level.yaml`, 'utf8'));
const codes = (problems, severity) => problems.filter((p) => !severity || p.severity === severity).map((p) => p.code);
const find = (problems, code) => problems.find((p) => p.code === code);

// --- Tous les niveaux existants : aucune erreur (les avertissements et infos sont permis).
for (const id of ids) {
    const problems = linter.lint(load(id), { knownLevelIds: ids.filter((other) => other !== id) });
    assert.deepEqual(codes(problems, 'error'), [], `${id} : ${JSON.stringify(problems.filter((p) => p.severity === 'error'))}`);
}

const base = () => structuredClone(load('05-decide'));
const lint = (level, options = {}) => linter.lint(level, { knownLevelIds: ids, ...options });

// --- Schéma : messages ciblés (et pas le déluge d'erreurs d'enveloppe du validateur).
let level = base(); delete level.mission.goal;
assert.deepEqual(find(lint(level), 'schema_required').path, ['mission']);
assert.equal(find(lint(level), 'schema_required').params.field, 'goal');
level = base(); level.id = 'Mauvais Id';
assert.deepEqual(find(lint(level), 'schema_pattern').path, ['id']);
level = base(); level.steps[1].type = 'video';
assert.deepEqual(find(lint(level), 'schema_enum').path, ['steps', 1, 'type']);
level = base(); level.steps[1].tests[0].kind = 'nope';
assert.ok(codes(lint(level), 'error').length > 0);
level = base(); level.steps[1].bonus = true;
assert.equal(find(lint(level), 'schema_unknown_field').params.field, 'bonus');
assert.ok(lint(level).length <= 2, 'pas de cascade de messages');
level = base(); level.difficulty = 99;
assert.deepEqual(find(lint(level), 'schema_range').path, ['difficulty']);
assert.equal(lint('pas un objet').at(0).code, 'schema_type');

// --- Traductions.
level = base(); delete level.title.en;
assert.deepEqual(find(lint(level), 'missing_english').path, ['title']);
level = base(); level.steps[1].hints.en = [];
assert.deepEqual(find(lint(level), 'missing_english').path, ['steps', 1, 'hints']);
level = base(); level.mission.goal.en = '   ';
assert.ok(find(lint(level), 'missing_english'));
assert.equal(find(lint(level, { requireEnglish: false }), 'missing_english'), undefined, 'option requireEnglish');
level = base(); level.steps[3].hints.en.pop();
assert.equal(find(lint(level), 'hint_count_differs').severity, 'warning');

// --- Références.
level = base(); level.requires = ['99-inconnu'];
assert.equal(find(lint(level), 'requires_unknown').params.id, '99-inconnu');
level = base(); level.requires = [level.id];
assert.ok(find(lint(level), 'requires_self'));
assert.equal(find(lint(base()), 'id_already_exists').severity, 'warning');
assert.equal(find(linter.lint(base(), { knownLevelIds: null }), 'id_already_exists'), undefined);

// --- Règles de contribution et tests.
level = base(); delete level.steps[1].solution;
assert.deepEqual(find(lint(level), 'solution_missing').path, ['steps', 1, 'solution']);
level = base(); delete level.mission.solution;
assert.deepEqual(find(lint(level), 'solution_missing').path, ['mission', 'solution']);
level = base(); delete level.steps[1].hints;
assert.equal(find(lint(level), 'hints_missing').severity, 'warning');
level = base(); level.steps[1].tests = [{ kind: 'function_called_with', value: 'f' }];
assert.equal(find(lint(level), 'kind_unsupported').params.kind, 'function_called_with');
level = base(); level.steps[1].tests = [{ kind: 'var_equals', value: 3 }];
assert.ok(find(lint(level), 'test_name_missing'));
level = base(); level.steps[1].tests = [{ kind: 'stdout_equals' }];
assert.ok(find(lint(level), 'test_value_missing'));
level = base(); level.steps[1].tests = [{ kind: 'stdout_matches_regex', value: '([' }];
assert.ok(find(lint(level), 'regex_invalid'));
level = base(); level.steps[1].tests = [{ kind: 'var_type_is', name: 'x', value: 'entier' }];
assert.equal(find(lint(level), 'type_unusual').severity, 'warning');
assert.ok(find(lint(load('01-hello')), 'voice_to_generate'), 'rappel : narration à générer');

console.log('level linter ok');
