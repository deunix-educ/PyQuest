// Progression de l'apprenant : niveaux complétés, XP (dérivés), badges, streak.
// Persistée via un magasin clé/valeur injecté (voir KeyValueStores.js). Fonctionne hors ligne ;
// la synchronisation Django optionnelle s'appuie sur export()/import().

const STORAGE_KEY = 'progress';
const SCHEMA_VERSION = 1;

// Badges de progression : règle déclarative évaluée sur l'état complet.
const BADGES = [
    { id: 'first_level', test: (state) => Object.keys(state.completedLevels).length >= 1 },
    { id: 'three_levels', test: (state) => Object.keys(state.completedLevels).length >= 3 },
    { id: 'xp_100', test: (state) => ProgressStore.totalXp(state) >= 100 },
    { id: 'streak_3', test: (state) => state.streak.best >= 3 },
    { id: 'streak_7', test: (state) => state.streak.best >= 7 },
];

export class ProgressStore {
    #store;
    #state = null;

    /** @param {{get: (key: string) => Promise<any>, set: (key: string, value: any) => Promise<void>}} store */
    constructor(store) {
        this.#store = store;
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
     * pour réunir deux appareils. `replace` écrase tout.
     */
    async import(json, { mode = 'merge' } = {}) {
        const incoming = this.#parseImport(json);
        const state = this.#requireState();
        if (mode === 'replace') {
            this.#state = incoming;
        } else {
            this.#merge(state, incoming);
        }
        await this.#save();
        return this.snapshot();
    }

    #parseImport(json) {
        let data;
        try {
            data = JSON.parse(json);
        } catch {
            throw new Error('Invalid progress file: not JSON');
        }
        const valid =
            data?.version === SCHEMA_VERSION &&
            typeof data.completedLevels === 'object' &&
            typeof data.badges === 'object' &&
            typeof data.streak === 'object';
        if (!valid) {
            throw new Error('Invalid progress file: unsupported format');
        }
        return data;
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
    }

    #requireState() {
        if (!this.#state) {
            throw new Error('ProgressStore.load() must be called first');
        }
        return this.#state;
    }
}
