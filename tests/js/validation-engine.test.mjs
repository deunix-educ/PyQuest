import { ValidationEngine } from '../../app/js/core/ValidationEngine.js';
import assert from 'node:assert';
const v = new ValidationEngine();
const ok = { ok: true, error: null, variables: { total: { type: 'float', value: 10, repr: '10.0' } } };
const tests = [
    { kind: 'var_equals', name: 'total', value: 10.0 },
    { kind: 'var_type_is', name: 'total', value: 'float' },
    { kind: 'stdout_equals', value: '10.0\n' },
    { kind: 'stdout_matches_regex', value: '^[^\\n]+\\n$' },
];
assert.deepEqual(ValidationEngine.variablesToCollect(tests), ['total']);
assert.ok(v.validate(tests, { stdout: '10.0\n', result: ok }).passed);
const bad = v.validate(tests, { stdout: '10\n', result: { ...ok, variables: { total: { type: 'int', value: 10 } } } });
assert.deepEqual(bad.results.map((r) => r.reason), [null, 'type_mismatch', 'stdout_mismatch', null]);
assert.equal(v.validate([{ kind: 'no_syntax_error' }], { stdout: '', result: { ok: false, error: { type: 'SyntaxError' }, variables: {} } }).results[0].reason, 'syntax_error');
assert.equal(v.validate([{ kind: 'no_syntax_error' }], { stdout: '', result: { ok: false, error: { type: 'NameError' }, variables: {} } }).passed, false);
assert.equal(v.validate([{ kind: 'var_equals', name: 'x', value: 1 }], { stdout: '', result: ok }).results[0].reason, 'variable_missing');
console.log('validation ok');
