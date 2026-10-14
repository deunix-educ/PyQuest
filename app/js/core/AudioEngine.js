// Effets sonores courts via Web Audio API, synthétisés (aucun fichier audio à servir ni à licencier).
// Toujours désactivable ; jamais déclenché avant un geste utilisateur (contrainte autoplay iOS).

// Chaque son est une suite de notes : fréquence (Hz), début et durée (s), forme d'onde.
const SOUNDS = {
    success_small: [
        { frequency: 659.25, start: 0, duration: 0.12, type: 'sine' },
        { frequency: 880, start: 0.1, duration: 0.2, type: 'sine' },
    ],
    success_big: [
        { frequency: 523.25, start: 0, duration: 0.12, type: 'triangle' },
        { frequency: 659.25, start: 0.12, duration: 0.12, type: 'triangle' },
        { frequency: 783.99, start: 0.24, duration: 0.12, type: 'triangle' },
        { frequency: 1046.5, start: 0.36, duration: 0.35, type: 'triangle' },
    ],
    level_unlocked: [
        { frequency: 392, start: 0, duration: 0.15, type: 'square' },
        { frequency: 523.25, start: 0.15, duration: 0.15, type: 'square' },
        { frequency: 659.25, start: 0.3, duration: 0.15, type: 'square' },
        { frequency: 783.99, start: 0.45, duration: 0.15, type: 'square' },
        { frequency: 1046.5, start: 0.6, duration: 0.5, type: 'square' },
    ],
    error: [
        { frequency: 220, start: 0, duration: 0.18, type: 'sawtooth' },
        { frequency: 174.61, start: 0.15, duration: 0.25, type: 'sawtooth' },
    ],
};

// Les sons « square » et « sawtooth » sont agressifs : gain de base réduit.
const BASE_GAIN = 0.15;

export class AudioEngine {
    #createContext;
    #context = null;
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
    }

    /**
     * À appeler depuis un geste utilisateur (clic sur « Exécuter », etc.) : crée ou reprend le
     * contexte audio, bloqué tant qu'aucun geste n'a eu lieu.
     */
    async unlock() {
        if (!this.#context) {
            this.#context = this.#createContext();
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
        const notes = SOUNDS[name];
        if (!this.#enabled || !this.#context || this.#context.state !== 'running' || !notes) {
            return false;
        }
        const context = this.#context;
        const now = context.currentTime;
        for (const note of notes) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const peak = BASE_GAIN * this.#volume;
            oscillator.type = note.type;
            oscillator.frequency.value = note.frequency;
            // Enveloppe courte pour éviter les clics de début et de fin.
            gain.gain.setValueAtTime(0, now + note.start);
            gain.gain.linearRampToValueAtTime(peak, now + note.start + 0.01);
            gain.gain.linearRampToValueAtTime(0, now + note.start + note.duration);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(now + note.start);
            oscillator.stop(now + note.start + note.duration + 0.02);
        }
        return true;
    }
}
