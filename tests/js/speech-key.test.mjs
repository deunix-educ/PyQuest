// Vecteurs communs avec tests/python/test_voice_key.py : les deux implémentations doivent concorder.
import { speechKey, speechText } from '../../app/js/core/speechKey.js';
import assert from 'node:assert';

assert.equal(speechText('  Un `print()`   affiche\n du texte. '), 'Un print() affiche du texte.');
assert.equal(speechKey('fr', 'Un `print()` affiche  du texte.'), '0933ff041539352b');
assert.equal(speechKey('en', 'Héllo wörld'), '87e2e25e5123e565');
assert.equal(speechKey('fr', ''), 'dc8d3218feba4761');
assert.notEqual(speechKey('fr', 'Bonjour'), speechKey('en', 'Bonjour'));
console.log('speech key ok');
