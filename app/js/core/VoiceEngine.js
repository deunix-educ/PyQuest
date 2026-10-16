// Narration vocale optionnelle, à appeler uniquement depuis un geste utilisateur (bouton « Écouter »).
// 1) fichier audio pré-généré avec Piper (make voice) : même qualité partout, hors ligne ;
// 2) repli : speechSynthesis (voix du système) si le fichier est absent ou illisible.
// Aucun service tiers.

const LANG_TAGS = { fr: 'fr-FR', en: 'en-US' };

export class VoiceEngine {
    #synth;
    #UtteranceClass;
    #AudioClass;
    #fetch;
    #enabled;
    #rate;
    #audio = null;
    #objectUrl = null;
    #session = 0;

    /**
     * @param {object} [options]
     * @param {boolean} [options.enabled]
     * @param {number} [options.rate]  Vitesse de 0.5 à 2 (1 = normale).
     * @param {SpeechSynthesis|null} [options.synth]  Remplaçable pour les tests.
     * @param {typeof SpeechSynthesisUtterance} [options.Utterance]
     * @param {typeof Audio|undefined} [options.AudioClass]
     * @param {typeof fetch} [options.fetchFn]
     */
    constructor({
        enabled = true,
        rate = 1,
        synth = globalThis.speechSynthesis ?? null,
        Utterance = globalThis.SpeechSynthesisUtterance,
        AudioClass = globalThis.Audio,
        fetchFn = (...args) => fetch(...args),
    } = {}) {
        this.#synth = synth;
        this.#UtteranceClass = Utterance;
        this.#AudioClass = AudioClass;
        this.#fetch = fetchFn;
        this.#enabled = enabled;
        this.#rate = rate;
    }

    /** Faux si ni fichier audio ni speechSynthesis ne sont utilisables : l'UI masque le bouton. */
    get supported() {
        return this.#AudioClass !== undefined || (this.#synth !== null && this.#UtteranceClass !== undefined);
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
        if (this.#audio) {
            this.#audio.playbackRate = this.#rate;
        }
    }

    /**
     * Lit un texte. Résout à la fin de la lecture ; false si rien n'a été lu ou si elle a été interrompue.
     * @param {string} text  Markdown léger toléré (les `` ` `` sont retirés pour la synthèse système).
     * @param {string} [lang]  'fr' ou 'en'.
     * @param {object} [options]
     * @param {string|null} [options.audioUrl]  Fichier pré-généré à préférer à la synthèse système.
     * @returns {Promise<boolean>}
     */
    async speak(text, lang = 'fr', { audioUrl = null } = {}) {
        if (!this.supported || !this.#enabled) {
            return false;
        }
        this.cancel();
        const session = this.#session;
        if (audioUrl && this.#AudioClass) {
            const played = await this.#playFile(audioUrl, session);
            if (played !== null) {
                return played;
            }
        }
        if (session !== this.#session) {
            return false;
        }
        return this.#speakWithSystemVoice(text, lang);
    }

    /** Interrompt toute lecture en cours (fichier ou synthèse). */
    cancel() {
        this.#session += 1;
        this.#releaseAudio();
        this.#synth?.cancel();
    }

    /**
     * Joue un fichier audio. Renvoie true (terminé), false (interrompu) ou null si le fichier est
     * indisponible, auquel cas l'appelant se rabat sur la voix système.
     */
    async #playFile(url, session) {
        let blob;
        try {
            const response = await this.#fetch(url);
            if (!response.ok) {
                return null;
            }
            blob = await response.blob();
        } catch {
            return null;
        }
        if (session !== this.#session) {
            return false;
        }
        // Lecture depuis un blob : pas de requêtes Range (exigées par iOS pour un flux direct).
        this.#objectUrl = URL.createObjectURL(blob);
        const audio = new this.#AudioClass(this.#objectUrl);
        audio.playbackRate = this.#rate;
        this.#audio = audio;
        return new Promise((resolve) => {
            let started = false;
            audio.onplaying = () => {
                started = true;
            };
            audio.onended = () => {
                this.#releaseAudio();
                resolve(true);
            };
            audio.onpause = () => resolve(false);
            audio.onerror = () => {
                this.#releaseAudio();
                resolve(started ? false : null);
            };
            Promise.resolve(audio.play()).catch(() => {
                this.#releaseAudio();
                resolve(null);
            });
        });
    }

    #releaseAudio() {
        if (this.#audio) {
            this.#audio.onpause = null;
            this.#audio.pause?.();
            this.#audio = null;
        }
        if (this.#objectUrl) {
            URL.revokeObjectURL(this.#objectUrl);
            this.#objectUrl = null;
        }
    }

    #speakWithSystemVoice(text, lang) {
        if (this.#synth === null || this.#UtteranceClass === undefined) {
            return Promise.resolve(false);
        }
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
