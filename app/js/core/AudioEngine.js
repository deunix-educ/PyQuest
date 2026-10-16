// Effets sonores courts via Web Audio API, synthétisés (aucun fichier audio à servir ni à licencier).
// Toujours désactivable ; jamais déclenché avant un geste utilisateur (contrainte autoplay iOS).
//
// Timbre : synthèse additive (fondamentale + 2 harmoniques, sinusoïdes) avec une attaque nette et
// une extinction exponentielle, pour un son de « carillon » doux plutôt que des ondes brutes.
// Niveau : un gain maître puis un compresseur ramènent tous les sons à un volume comparable et
// audible sans saturer (voir tests/e2e : mesure de crête et de niveau efficace).

// Partiels d'un timbre : [multiple de la fréquence, amplitude relative].
const BELL = [
    [1, 1],
    [2, 0.35],
    [3, 0.12],
];
const SOFT = [
    [1, 1],
    [2, 0.5],
];

// Chaque note : fréquence (Hz), début et durée (s), gain relatif (accords : < 1), timbre.
const SOUNDS = {
    success_small: [
        { frequency: 659.25, start: 0, duration: 0.3, gain: 0.9, timbre: BELL },
        { frequency: 880, start: 0.11, duration: 0.5, gain: 1, timbre: BELL },
    ],
    success_big: [
        { frequency: 523.25, start: 0, duration: 0.3, gain: 0.8, timbre: BELL },
        { frequency: 659.25, start: 0.12, duration: 0.3, gain: 0.8, timbre: BELL },
        { frequency: 783.99, start: 0.24, duration: 0.3, gain: 0.8, timbre: BELL },
        { frequency: 1046.5, start: 0.36, duration: 0.9, gain: 0.6, timbre: BELL },
        { frequency: 783.99, start: 0.36, duration: 0.9, gain: 0.5, timbre: BELL },
        { frequency: 523.25, start: 0.36, duration: 0.9, gain: 0.5, timbre: BELL },
    ],
    level_unlocked: [
        { frequency: 392, start: 0, duration: 0.3, gain: 0.8, timbre: BELL },
        { frequency: 523.25, start: 0.14, duration: 0.3, gain: 0.8, timbre: BELL },
        { frequency: 659.25, start: 0.28, duration: 0.3, gain: 0.8, timbre: BELL },
        { frequency: 783.99, start: 0.42, duration: 0.3, gain: 0.8, timbre: BELL },
        { frequency: 1046.5, start: 0.56, duration: 1.2, gain: 0.6, timbre: BELL },
        { frequency: 783.99, start: 0.56, duration: 1.2, gain: 0.45, timbre: BELL },
        { frequency: 659.25, start: 0.56, duration: 1.2, gain: 0.45, timbre: BELL },
    ],
    error: [
        { frequency: 293.66, start: 0, duration: 0.25, gain: 0.9, timbre: SOFT },
        { frequency: 220, start: 0.16, duration: 0.45, gain: 1, timbre: SOFT },
    ],
};

const ATTACK_S = 0.008;
const SILENCE = 0.0001; // cible de l'extinction exponentielle (ne peut pas valoir 0)
// Niveau de crête d'une note de gain 1 avant compresseur : laisse de la marge aux accords.
const NOTE_PEAK = 0.45;

export class AudioEngine {
    #createContext;
    #context = null;
    #master = null;
    #output = null;
    #enabled;
    #volume;

    /**
     * @param {object} [options]
     * @param {boolean} [options.enabled]
     * @param {number} [options.volume]  De 0 à 1.
     * @param {() => AudioContext|null} [options.contextFactory]  Remplaçable pour les tests.
     */
    constructor({ enabled = true, volume = 0.8, contextFactory = AudioEngine.#defaultFactory } = {}) {
        this.#enabled = enabled;
        this.#volume = volume;
        this.#createContext = contextFactory;
    }

    static #defaultFactory() {
        const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        return Context ? new Context() : null;
    }

    static get soundNames() {
        return Object.keys(SOUNDS);
    }

    /**
     * Construit la chaîne de sortie (gain maître → compresseur → sortie) et renvoie ses nœuds.
     * Exposé pour que les tests rendent les sons hors ligne avec exactement la même chaîne.
     */
    static buildOutput(context, volume) {
        const master = context.createGain();
        master.gain.value = volume;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 10;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;
        master.connect(compressor).connect(context.destination);
        return { input: master, master };
    }

    /**
     * Programme les notes d'un son sur `destination`, à partir de `when`.
     * @returns {number} durée totale en secondes (queue d'extinction comprise)
     */
    static schedule(context, destination, name, when = context.currentTime) {
        let end = 0;
        for (const note of SOUNDS[name]) {
            const noteStart = when + note.start;
            const noteEnd = noteStart + note.duration;
            const peak = NOTE_PEAK * note.gain;
            for (const [multiple, amplitude] of note.timbre) {
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.value = note.frequency * multiple;
                // Attaque courte (pas de clic), puis extinction exponentielle.
                gain.gain.setValueAtTime(0, noteStart);
                gain.gain.linearRampToValueAtTime(peak * amplitude, noteStart + ATTACK_S);
                gain.gain.exponentialRampToValueAtTime(SILENCE, noteEnd);
                oscillator.connect(gain).connect(destination);
                oscillator.start(noteStart);
                oscillator.stop(noteEnd + 0.02);
            }
            end = Math.max(end, note.start + note.duration + 0.02);
        }
        return end;
    }

    get enabled() {
        return this.#enabled;
    }

    get volume() {
        return this.#volume;
    }

    /** Vrai si le navigateur sait produire du son. */
    get supported() {
        return Boolean(globalThis.AudioContext ?? globalThis.webkitAudioContext) || this.#context !== null;
    }

    setEnabled(enabled) {
        this.#enabled = enabled;
    }

    setVolume(volume) {
        this.#volume = Math.min(1, Math.max(0, volume));
        if (this.#master) {
            this.#master.gain.value = this.#volume;
        }
    }

    /**
     * À appeler depuis un geste utilisateur (clic sur « Exécuter », etc.) : crée ou reprend le
     * contexte audio, bloqué tant qu'aucun geste n'a eu lieu.
     */
    async unlock() {
        if (!this.#context) {
            this.#context = this.#createContext();
            if (this.#context) {
                const output = AudioEngine.buildOutput(this.#context, this.#volume);
                this.#master = output.master;
                this.#output = output.input;
            }
        }
        if (this.#context?.state === 'suspended') {
            await this.#context.resume();
        }
        return this.#context !== null;
    }

    /**
     * Joue un son prédéfini. Sans effet si désactivé, non débloqué ou nom inconnu.
     * @returns {boolean} vrai si le son a été lancé
     */
    play(name) {
        if (!this.#enabled || !this.#context || this.#context.state !== 'running' || !SOUNDS[name]) {
            return false;
        }
        AudioEngine.schedule(this.#context, this.#output, name);
        return true;
    }
}
