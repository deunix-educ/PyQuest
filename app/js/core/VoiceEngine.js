// Narration vocale optionnelle, à appeler uniquement depuis un geste utilisateur (bouton « Écouter »).
// 1) fichier audio pré-généré avec Piper (make voice) : même qualité partout, hors ligne ;
// 2) repli : speechSynthesis (voix du système) si le fichier est absent ou illisible.
// Aucun service tiers.

const LANG_TAGS = { fr: 'fr-FR', en: 'en-US' };
// WAV silencieux minimal : sert à « amorcer » l'élément audio pendant le clic (voir #prime).
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export class VoiceEngine {
    #synth;
    #UtteranceClass;
    #AudioClass;
    #fetch;
    #enabled;
    #rate;
    #player = null;
    #objectUrl = null;
    #session = 0;
    #lastFailure = null;
    #settle = null; // résolveur de la lecture de fichier en cours (pour la terminer si on l'interrompt)

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

    /** null, ou 'unavailable' si la dernière lecture demandée n'a rien pu jouer (à signaler à l'apprenant). */
    get lastFailure() {
        return this.#lastFailure;
    }

    setEnabled(enabled) {
        this.#enabled = enabled;
        if (!enabled) {
            this.cancel();
        }
    }

    setRate(rate) {
        this.#rate = Math.min(2, Math.max(0.5, rate));
        if (this.#player) {
            this.#player.playbackRate = this.#rate;
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
        this.#lastFailure = null;
        if (!this.supported || !this.#enabled) {
            return false;
        }
        this.cancel();
        // Doit s'exécuter de façon synchrone dans le gestionnaire de clic, avant tout await.
        this.#prime();
        const session = this.#session;
        // Une lecture interrompue (nouvelle demande, annulation) n'est pas une panne.
        const finish = (ok) => {
            if (!ok && session === this.#session) {
                this.#lastFailure = 'unavailable';
            }
            return ok;
        };
        if (audioUrl && this.#AudioClass) {
            const played = await this.#playFile(audioUrl, session);
            if (played !== null) {
                return finish(played);
            }
        }
        if (session !== this.#session) {
            return false;
        }
        return finish(await this.#speakWithSystemVoice(text, lang));
    }

    /**
     * Débloque l'élément audio pendant le geste utilisateur. Safari/iOS n'autorise la lecture
     * que si l'élément a été démarré par un geste ; or le fichier n'arrive qu'après un fetch
     * asynchrone. On joue donc un silence tout de suite, puis on change la source plus tard.
     */
    #prime() {
        if (!this.#AudioClass) {
            return;
        }
        this.#player ??= new this.#AudioClass();
        this.#player.src = SILENT_WAV;
        Promise.resolve(this.#player.play()).catch(() => {});
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
        const audio = this.#player;
        audio.src = this.#objectUrl;
        audio.playbackRate = this.#rate;
        return new Promise((resolve) => {
            let started = false;
            const settle = (value) => {
                if (this.#settle === settle) {
                    this.#settle = null;
                }
                resolve(value);
            };
            this.#settle = settle;
            audio.onplaying = () => {
                started = true;
            };
            // Pas de gestion de `pause` : les navigateurs la déclenchent aussi juste avant `ended`.
            audio.onended = () => {
                this.#releaseAudio({ interrupted: false });
                settle(true);
            };
            audio.onerror = () => {
                this.#releaseAudio({ interrupted: false });
                settle(started ? false : null);
            };
            Promise.resolve(audio.play()).catch(() => {
                this.#releaseAudio({ interrupted: false });
                settle(null);
            });
        });
    }

    /** Arrête et libère la lecture ; si elle est interrompue, la promesse de #playFile résout false. */
    #releaseAudio({ interrupted = true } = {}) {
        const settle = this.#settle;
        this.#settle = null;
        if (interrupted) {
            settle?.(false);
        }
        if (this.#player) {
            this.#player.onended = null;
            this.#player.onerror = null;
            this.#player.onplaying = null;
            this.#player.pause?.();
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
