// Modèle de formulaire de l'éditeur de niveaux ⇄ niveau au format du schéma.
// Le formulaire manipule des champs « complets » (textes fr/en, indices sur des lignes, valeurs en texte) ;
// toLevel() produit l'objet propre du schéma (champs facultatifs vides omis, ordre des clés stable) et
// fromLevel() fait l'inverse. toLevel(fromLevel(niveau)) redonne le niveau d'origine (testé sur tous les niveaux).

import yaml from '../lib/js-yaml/js-yaml.mjs';

export const REWARD_SOUNDS = ['success_small', 'success_big', 'level_unlocked'];
export const PYTHON_TYPES = ['str', 'int', 'float', 'bool', 'list', 'dict'];

/** Kinds éditables et champs qu'ils utilisent. */
export const TEST_KINDS = {
    no_syntax_error: { name: false, value: false },
    stdout_equals: { name: false, value: 'text' },
    stdout_contains: { name: false, value: 'text' },
    stdout_matches_regex: { name: false, value: 'text' },
    code_contains: { name: false, value: 'text' },
    var_equals: { name: true, value: 'typed' },
    var_type_is: { name: true, value: 'type' },
    drawing_segments: { name: false, value: 'text' },
    drawing_has_line: { name: false, value: 'text' },
    drawing_colors: { name: false, value: 'text' },
};

const i18n = (fr = '', en = '') => ({ fr, en });

export function emptyLevelModel() {
    return {
        id: '',
        title: i18n(),
        difficulty: 1,
        xp: 30,
        requires: [],
        steps: [],
        mission: { title: i18n(), goal: i18n(), starter: '', tests: [], solution: '', rewardSound: 'success_small' },
    };
}

export function newTestModel(kind = 'stdout_equals') {
    return { kind, name: '', value: '', valueType: 'text', inputs: '', message: i18n() };
}

export function newStepModel(type) {
    return type === 'explain'
        ? { type: 'explain', text: i18n(), voice: true, image: '' }
        : { type: 'code', instruction: i18n(), starter: '', tests: [newTestModel()], hints: i18n(), solution: '' };
}

// ---- modèle -> niveau ------------------------------------------------------------------------------------

const text = ({ fr, en }) => (en ? { fr, en } : { fr });
const lines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean);

/** Saisies scriptées : une par ligne, les lignes vides finales sont ignorées (celles du milieu sont des saisies vides). */
function inputLines(value) {
    const all = value.split('\n');
    while (all.length > 0 && all.at(-1) === '') {
        all.pop();
    }
    return all;
}

function testToLevel(test) {
    const spec = TEST_KINDS[test.kind];
    const out = { kind: test.kind };
    if (spec.name) {
        out.name = test.name;
    }
    if (spec.value === 'typed') {
        out.value = test.valueType === 'number' && test.value.trim() !== '' && !Number.isNaN(Number(test.value)) ? Number(test.value) : test.valueType === 'boolean' ? test.value === 'true' : test.value;
    } else if (spec.value) {
        out.value = test.value;
    }
    const inputs = inputLines(test.inputs);
    if (inputs.length > 0) {
        out.inputs = inputs;
    }
    if (test.message.fr || test.message.en) {
        out.message = text(test.message);
    }
    return out;
}

function stepToLevel(step) {
    if (step.type === 'explain') {
        const out = { type: 'explain' };
        if (step.voice) {
            out.voice = true;
        }
        out.text = text(step.text);
        if (step.image.trim()) {
            out.image = step.image.trim();
        }
        return out;
    }
    const out = { type: 'code', starter: step.starter, instruction: text(step.instruction), tests: step.tests.map(testToLevel) };
    const hints = {};
    for (const lang of ['fr', 'en']) {
        const list = lines(step.hints[lang]);
        if (list.length > 0) {
            hints[lang] = list;
        }
    }
    if (Object.keys(hints).length > 0) {
        out.hints = hints;
    }
    if (step.solution.trim()) {
        out.solution = step.solution;
    }
    return out;
}

/** Modèle de formulaire -> niveau au format du schéma. */
export function toLevel(model) {
    const { mission } = model;
    const outMission = { title: text(mission.title), goal: text(mission.goal) };
    if (mission.starter.trim()) {
        outMission.starter = mission.starter;
    }
    if (mission.tests.length > 0) {
        outMission.tests = mission.tests.map(testToLevel);
    }
    if (mission.solution.trim()) {
        outMission.solution = mission.solution;
    }
    if (mission.rewardSound) {
        outMission.reward_sound = mission.rewardSound;
    }
    return {
        id: model.id,
        title: text(model.title),
        difficulty: model.difficulty,
        xp: model.xp,
        requires: [...model.requires],
        steps: model.steps.map(stepToLevel),
        mission: outMission,
    };
}

// ---- niveau -> modèle ------------------------------------------------------------------------------------

const fromText = (value) => i18n(value?.fr ?? '', value?.en ?? '');
const fromHints = (hints) => i18n((hints?.fr ?? []).join('\n'), (hints?.en ?? []).join('\n'));

function testFromLevel(test) {
    const model = newTestModel(test.kind);
    model.name = test.name ?? '';
    const { value } = test;
    if (typeof value === 'number') {
        model.valueType = 'number';
        model.value = String(value);
    } else if (typeof value === 'boolean') {
        model.valueType = 'boolean';
        model.value = String(value);
    } else {
        model.value = value ?? '';
    }
    model.inputs = (test.inputs ?? []).join('\n');
    model.message = fromText(test.message);
    return model;
}

function stepFromLevel(step) {
    if (step.type === 'explain') {
        return { type: 'explain', text: fromText(step.text), voice: Boolean(step.voice), image: step.image ?? '' };
    }
    return {
        type: 'code',
        instruction: fromText(step.instruction),
        starter: step.starter ?? '',
        tests: (step.tests ?? []).map(testFromLevel),
        hints: fromHints(step.hints),
        solution: step.solution ?? '',
    };
}

/** Niveau au format du schéma -> modèle de formulaire (tolère les champs absents). */
export function fromLevel(level) {
    const mission = level.mission ?? {};
    return {
        id: level.id ?? '',
        title: fromText(level.title),
        difficulty: level.difficulty ?? 1,
        xp: level.xp ?? 0,
        requires: [...(level.requires ?? [])],
        steps: (level.steps ?? []).map(stepFromLevel),
        mission: {
            title: fromText(mission.title),
            goal: fromText(mission.goal),
            starter: mission.starter ?? '',
            tests: (mission.tests ?? []).map(testFromLevel),
            solution: mission.solution ?? '',
            rewardSound: mission.reward_sound ?? '',
        },
    };
}

// ---- YAML ------------------------------------------------------------------------------------------------

/**
 * js-yaml écrit chaque élément de liste sur deux lignes (« - » seul puis le contenu indenté de 4 espaces).
 * On le ramène au style des niveaux écrits à la main : « - clé: valeur » avec le reste aligné deux colonnes
 * à droite du tiret.
 */
function compactListItems(source) {
    const input = source.split('\n');
    const output = [];
    const indentOf = (line) => line.length - line.trimStart().length;
    for (let i = 0; i < input.length; i++) {
        const line = input[i];
        if (/(^|\s)\|[-+]?$/.test(line)) {
            // Bloc littéral (code, texte multiligne) : copié tel quel, même s'il contient une ligne « - ».
            output.push(line);
            while (i + 1 < input.length && (input[i + 1] === '' || indentOf(input[i + 1]) > indentOf(line))) {
                output.push(input[++i]);
            }
            continue;
        }
        if (!/^\s*-$/.test(line)) {
            output.push(line);
            continue;
        }
        const base = indentOf(line);
        const block = [];
        while (i + 1 < input.length && (input[i + 1] === '' || indentOf(input[i + 1]) > base)) {
            block.push(input[++i]);
        }
        // Récursion : les listes imbriquées sont d'abord compactées, puis tout le bloc recule de deux colonnes.
        const inner = compactListItems(block.join('\n')).split('\n').map((blockLine) => (blockLine === '' ? '' : blockLine.slice(2)));
        const [first, ...rest] = inner;
        output.push(`${' '.repeat(base)}- ${first.trimStart()}`, ...rest);
    }
    return output.join('\n');
}

/** Sérialise un niveau en YAML conforme aux conventions du projet (4 espaces, pas de repli de ligne). */
export function levelToYaml(level) {
    return compactListItems(yaml.dump(level, { indent: 4, lineWidth: -1, noRefs: true, noCompatMode: true, quotingType: '"' }));
}

export function levelFromYaml(source) {
    return yaml.load(source);
}
