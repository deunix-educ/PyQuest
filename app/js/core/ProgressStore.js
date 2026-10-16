// Progression de l'apprenant : niveaux complétés, XP (dérivés), badges, streak.
// Persistée via un magasin clé/valeur injecté (voir KeyValueStores.js). Fonctionne hors ligne ;
// la synchronisation Django optionnelle s'appuie sur export()/import().

const STORAGE_KEY = 'progress';
const SCHEMA_VERSION = 1;
const ID_PATTERN = /^(?!__proto__$)[A-Za-z0-9_-]{1,64}$/;
const MAX_ENTRIES = 500;
const MAX_LEVEL_XP = 100000;

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Badges de progression : règle déclarative évaluée sur l'état complet.
const BADGES = [
    { id: 'first_level', test: (state) => Object.keys(state.completedLevels).length >= 1 },
    { id: 'three_levels', test: (state) => Object.keys(state.completedLevels).length >= 3 },
    { id: 'xp_100', test: (state) => ProgressStore.totalXp(state) >= 100 },
    { id: 'streak_3', test: (state) => state.streak.best >= 3 },
    { id: 'streak_7', test: (state) => state.streak.best >= 7 },
];

export class ProgressStore extends EventTarget {
    #store;
    #state = null;

    /** @param {{get: (key: string) => Promise<any>, set: (key: string, value: any) => Promise<void>}} store */
    constructor(store) {
        super();
        this.#store = store;
    }

    /** Identifiants de tous les badges existants (pour afficher aussi ceux à débloquer). */
    static get badgeIds() {
        return BADGES.map((badge) => badge.id);
    }

    static emptyState() {
        return {
            version: SCHEMA_VERSION,
            completedLevels: {},
            badges: {},
            streak: { current: 0, best: 0, lastDay: null },
        };
    }

    /** Somme des XP des niveaux complétés (dérivée, jamais stockée : évite les incohérences). */
    static totalXp(state) {
        return Object.values(state.completedLevels).reduce((sum, level) => sum + level.xp, 0);
    }

    /** Jour calendaire local au format AAAA-MM-JJ. */
    static dayKey(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    async load() {
        const saved = await this.#store.get(STORAGE_KEY);
        this.#state = saved && saved.version === SCHEMA_VERSION ? saved : ProgressStore.emptyState();
        return this.snapshot();
    }

    /** Copie de l'état courant, avec l'XP total calculé. */
    snapshot() {
        const state = structuredClone(this.#requireState());
        return { ...state, xp: ProgressStore.totalXp(state) };
    }

    isCompleted(levelId) {
        return levelId in this.#requireState().completedLevels;
    }

    /**
     * Enregistre une activité du jour (met à jour le streak).
     * @returns {Promise<{current: number, best: number}>}
     */
    async recordActivity(now = new Date()) {
        const state = this.#requireState();
        this.#touchStreak(state, now);
        await this.#save();
        return { current: state.streak.current, best: state.streak.best };
    }

    /**
     * Marque un niveau comme complété. L'XP n'est accordé qu'une fois par niveau.
     * @returns {Promise<{xpGained: number, alreadyCompleted: boolean, newBadges: string[], streak: {current: number, best: number}}>}
     */
    async completeLevel(levelId, xp, now = new Date()) {
        const state = this.#requireState();
        this.#touchStreak(state, now);
        const alreadyCompleted = levelId in state.completedLevels;
        if (!alreadyCompleted) {
            state.completedLevels[levelId] = { xp, completedAt: now.toISOString() };
        }
        const newBadges = this.#awardBadges(state, now);
        await this.#save();
        return {
            xpGained: alreadyCompleted ? 0 : xp,
            alreadyCompleted,
            newBadges,
            streak: { current: state.streak.current, best: state.streak.best },
        };
    }

    /** Sérialise la progression pour sauvegarde manuelle ou synchronisation. */
    export() {
        return JSON.stringify(this.#requireState());
    }

    /**
     * Importe une progression exportée. Fusion par défaut (union, jamais de perte) : pratique
     * pour réunir deux appareils. `replace` écrase tout. Lève une erreur si le contenu est invalide.
     */
    async import(json, { mode = 'merge' } = {}) {
        const incoming = this.#parseImport(json);
        const state = this.#requireState();
        const before = Object.keys(state.completedLevels).length;
        if (mode === 'replace') {
            this.#state = incoming;
        } else {
            this.#merge(state, incoming);
        }
        await this.#save();
        // `addedLevels` : niveaux nouveaux pour cet appareil (pour informer l'apprenant).
        const after = Object.keys(this.#requireState().completedLevels).length;
        return { ...this.snapshot(), addedLevels: Math.max(0, after - before) };
    }

    /** Valide strictement un fichier venant de l'extérieur (jamais fiable : fichier édité, jeton volé…). */
    #parseImport(json) {
        let data;
        try {
            data = JSON.parse(json);
        } catch {
            throw new Error('Invalid progress file: not JSON');
        }
        if (!isPlainObject(data) || data.version !== SCHEMA_VERSION) {
            throw new Error('Invalid progress file: unsupported format');
        }
        const { completedLevels, badges, streak } = data;
        const valid =
            isPlainObject(completedLevels) &&
            Object.entries(completedLevels).length <= MAX_ENTRIES &&
            Object.entries(completedLevels).every(
                ([id, level]) =>
                    ID_PATTERN.test(id) &&
                    isPlainObject(level) &&
                    Number.isFinite(level.xp) &&
                    level.xp >= 0 &&
                    level.xp <= MAX_LEVEL_XP &&
                    typeof level.completedAt === 'string',
            ) &&
            isPlainObject(badges) &&
            Object.entries(badges).length <= MAX_ENTRIES &&
            Object.entries(badges).every(([id, at]) => ID_PATTERN.test(id) && typeof at === 'string') &&
            isPlainObject(streak) &&
            Number.isInteger(streak.current) &&
            Number.isInteger(streak.best) &&
            (streak.lastDay === null || typeof streak.lastDay === 'string');
        if (!valid) {
            throw new Error('Invalid progress file: unsupported format');
        }
        // On ne reprend que les champs connus.
        return { version: SCHEMA_VERSION, completedLevels, badges, streak: { current: streak.current, best: streak.best, lastDay: streak.lastDay } };
    }

    #merge(state, incoming) {
        for (const [id, level] of Object.entries(incoming.completedLevels)) {
            const existing = state.completedLevels[id];
            if (!existing || level.completedAt < existing.completedAt) {
                state.completedLevels[id] = level;
            }
        }
        for (const [id, earnedAt] of Object.entries(incoming.badges)) {
            if (!(id in state.badges) || earnedAt < state.badges[id]) {
                state.badges[id] = earnedAt;
            }
        }
        const mine = state.streak;
        const theirs = incoming.streak;
        mine.best = Math.max(mine.best, theirs.best);
        // Le streak courant est celui de l'appareil le plus récemment actif.
        if ((theirs.lastDay ?? '') > (mine.lastDay ?? '')) {
            mine.current = theirs.current;
            mine.lastDay = theirs.lastDay;
        }
    }

    #touchStreak(state, now) {
        const today = ProgressStore.dayKey(now);
        const { streak } = state;
        if (streak.lastDay === today) {
            return;
        }
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        streak.current = streak.lastDay === ProgressStore.dayKey(yesterday) ? streak.current + 1 : 1;
        streak.best = Math.max(streak.best, streak.current);
        streak.lastDay = today;
    }

    #awardBadges(state, now) {
        const earned = [];
        for (const badge of BADGES) {
            if (!(badge.id in state.badges) && badge.test(state)) {
                state.badges[badge.id] = now.toISOString();
                earned.push(badge.id);
            }
        }
        return earned;
    }

    async #save() {
        await this.#store.set(STORAGE_KEY, this.#state);
        this.dispatchEvent(new Event('change'));
    }

    #requireState() {
        if (!this.#state) {
            throw new Error('ProgressStore.load() must be called first');
        }
        return this.#state;
    }
}
