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

// Tests sur le dessin (canvas.line)
const square = [[0, 0, 100, 0, 'red'], [100, 0, 100, 100, 'red'], [100, 100, 0, 100, 'red'], [0, 100, 0, 0, 'blue']];
const draw = (tests, drawing) => v.validate(tests, { stdout: '', result: { ok: true, error: null, variables: {}, drawing } }).results.map((r) => r.reason);
assert.deepEqual(draw([{ kind: 'drawing_segments', value: '4' }, { kind: 'drawing_segments', value: '3+' }], square), [null, null]);
assert.deepEqual(draw([{ kind: 'drawing_segments', value: '5' }], square), ['drawing_too_few']);
assert.deepEqual(draw([{ kind: 'drawing_segments', value: '2' }], square), ['drawing_too_many']);
assert.deepEqual(draw([{ kind: 'drawing_segments', value: '5+' }], square), ['drawing_too_few']);
assert.deepEqual(draw([{ kind: 'drawing_segments', value: 'quatre' }], square), ['invalid_test']);
assert.deepEqual(draw([{ kind: 'drawing_has_line', value: '0,0 100,0' }, { kind: 'drawing_has_line', value: '100,0 0,0 red' }, { kind: 'drawing_has_line', value: '0.2,0 99.8,0.3' }], square), [null, null, null], 'sens libre, tolérance 0,5');
assert.deepEqual(draw([{ kind: 'drawing_has_line', value: '0,0 100,0 blue' }, { kind: 'drawing_has_line', value: '0,0 100,100' }, { kind: 'drawing_has_line', value: '0,0 100,0 pink' }], square), ['drawing_line_missing', 'drawing_line_missing', 'invalid_test']);
assert.deepEqual(draw([{ kind: 'drawing_colors', value: 'red, blue' }, { kind: 'drawing_colors', value: 'green' }, { kind: 'drawing_colors', value: '' }], square), [null, 'drawing_color_missing', 'invalid_test']);
assert.deepEqual(draw([{ kind: 'drawing_segments', value: '1' }], undefined), ['drawing_missing']);
assert.deepEqual(draw([{ kind: 'drawing_segments', value: '1' }], []), ['drawing_too_few']);
console.log('validation ok');
