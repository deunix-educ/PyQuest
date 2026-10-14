// Parcours d'un niveau par l'apprenant : étapes localisées puis mission finale.

export class LevelSession {
    #level;
    #lang;
    #baseUrl;
    #index = 0;

    /**
     * @param {object} level  Niveau brut (conforme à level.schema.json).
     * @param {string} lang  Langue d'affichage ('fr' ou 'en').
     * @param {string} baseUrl  URL du dossier du niveau, avec slash final (pour les images).
     */
    constructor(level, lang, baseUrl) {
        this.#level = level;
        this.#lang = lang;
        this.#baseUrl = baseUrl;
    }

    get id() {
        return this.#level.id;
    }

    get title() {
        return this.#localize(this.#level.title);
    }

    get xp() {
        return this.#level.xp;
    }

    get stepCount() {
        return this.#level.steps.length;
    }

    /** Index de l'étape courante ; égal à stepCount quand on est sur la mission. */
    get index() {
        return this.#index;
    }

    get onMission() {
        return this.#index >= this.stepCount;
    }

    /** Étape courante localisée, ou null sur la mission. */
    get step() {
        return this.onMission ? null : this.#viewStep(this.#level.steps[this.#index]);
    }

    /** Mission finale localisée. */
    get mission() {
        const { mission } = this.#level;
        return {
            title: this.#localize(mission.title),
            goal: this.#localize(mission.goal),
            starter: mission.starter ?? '',
            tests: this.#viewTests(mission.tests ?? []),
            rewardSound: mission.reward_sound ?? null,
        };
    }

    /** Avance d'une étape (puis vers la mission). Renvoie false si déjà sur la mission. */
    next() {
        if (this.onMission) {
            return false;
        }
        this.#index += 1;
        return true;
    }

    /** Revient d'une étape. Renvoie false si on est déjà à la première. */
    previous() {
        if (this.#index === 0) {
            return false;
        }
        this.#index -= 1;
        return true;
    }

    #localize(value) {
        return value?.[this.#lang] ?? value?.fr ?? '';
    }

    #viewTests(tests) {
        return tests.map((test) => ({
            ...test,
            message: test.message ? this.#localize(test.message) : null,
        }));
    }

    #viewStep(step) {
        if (step.type === 'explain') {
            return {
                type: 'explain',
                text: this.#localize(step.text),
                voice: step.voice ?? false,
                image: step.image ? new URL(step.image, this.#baseUrl).href : null,
            };
        }
        return {
            type: 'code',
            starter: step.starter,
            instruction: this.#localize(step.instruction),
            tests: this.#viewTests(step.tests),
            // Indices dans la langue demandée, sinon repli sur le français.
            hints: step.hints?.[this.#lang] ?? step.hints?.fr ?? [],
            solution: step.solution ?? null,
        };
    }
}
