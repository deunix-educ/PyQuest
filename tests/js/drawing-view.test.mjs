import { test } from 'node:test';
import assert from 'node:assert';
import { describeDrawing, describeSegment } from '../../app/js/ui/DrawingView.js';
import { I18n } from '../../app/js/i18n/i18n.js';
import { readFileSync } from 'node:fs';

const load = (lang) => JSON.parse(readFileSync(new URL(`../../app/js/i18n/${lang}.json`, import.meta.url)));
const i18n = new I18n({ fr: load('fr'), en: load('en') }, 'fr');
const t = (key, params) => i18n.t(key, params);

test('description textuelle du dessin', () => {
    assert.equal(describeDrawing([], t), 'Feuille vide : aucun trait tracé.');
    const drawing = [[0, 0, 100, 0, 'red'], [100, 0, 100, 100, 'red'], [0, 0, 0, 50, 'blue']];
    assert.equal(describeDrawing(drawing, t), 'Dessin de 3 trait(s). Couleurs : rouge, bleu.');
    assert.equal(describeSegment([0, 0, 70.71, 70.7099, 'blue'], t), 'De (0, 0) à (70.71, 70.71), bleu');
    i18n.setLang('en');
    assert.equal(describeDrawing(drawing, t), 'Drawing of 3 line(s). Colours: red, blue.');
});
