// Narration vocale optionnelle via speechSynthesis (voix du système, aucun service tiers).
// À appeler uniquement depuis un geste utilisateur (bouton « Écouter »), jamais automatiquement.

const LANG_TAGS = { fr: 'fr-FR', en: 'en-US' };

export class VoiceEngine {
    #synth;
    #UtteranceClass;
    #enabled;
    #rate;

    /**
     * @param {object} [options]
     * @param {boolean} [options.enabled]
     * @param {number} [options.rate]  Vitesse de 0.5 à 2 (1 = normale).
     * @param {SpeechSynthesis|null} [options.synth]  Remplaçable pour les tests.
     * @param {typeof SpeechSynthesisUtterance} [options.Utterance]
     */
    constructor({
        enabled = true,
        rate = 1,
        synth = globalThis.speechSynthesis ?? null,
        Utterance = globalThis.SpeechSynthesisUtterance,
    } = {}) {
        this.#synth = synth;
        this.#UtteranceClass = Utterance;
        this.#enabled = enabled;
        this.#rate = rate;
    }

    /** Faux sur les navigateurs sans speechSynthesis : l'UI masque alors le bouton. */
    get supported() {
        return this.#synth !== null && this.#UtteranceClass !== undefined;
    }

    get enabled() {
        return this.#enabled;
    }

    get rate() {
        return this.#rate;
    }

    setEnabled(enabled) {
        this.#enabled = enabled;
        if (!enabled) {
            this.cancel();
        }
    }

    setRate(rate) {
        this.#rate = Math.min(2, Math.max(0.5, rate));
    }

    /**
     * Lit un texte. Résout à la fin de la lecture ; false si rien n'a été lu.
     * @param {string} text  Markdown léger toléré (les `` ` `` sont retirés).
     * @param {string} [lang]  'fr' ou 'en'.
     * @returns {Promise<boolean>}
     */
    speak(text, lang = 'fr') {
        if (!this.supported || !this.#enabled) {
            return Promise.resolve(false);
        }
        this.cancel();
        const utterance = new this.#UtteranceClass(this.#clean(text));
        utterance.lang = LANG_TAGS[lang] ?? lang;
        utterance.rate = this.#rate;
        const voice = this.#pickVoice(utterance.lang);
        if (voice) {
            utterance.voice = voice;
        }
        return new Promise((resolve) => {
            utterance.onend = () => resolve(true);
            // Un cancel() déclenche aussi onerror : ce n'est pas une panne.
            utterance.onerror = () => resolve(false);
            this.#synth.speak(utterance);
        });
    }

    cancel() {
        this.#synth?.cancel();
    }

    /** Voix du système correspondant à la langue, en privilégiant l'étiquette exacte. */
    #pickVoice(tag) {
        const voices = this.#synth.getVoices?.() ?? [];
        const base = tag.split('-')[0];
        return (
            voices.find((voice) => voice.lang === tag) ?? voices.find((voice) => voice.lang.split(/[-_]/)[0] === base) ?? null
        );
    }

    #clean(text) {
        return text.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    }
}
