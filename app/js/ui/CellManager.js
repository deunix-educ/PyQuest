// Orchestre un niveau : affiche les étapes, exécute les cellules, valide, attribue la progression.
// Émet 'levelcomplete' (detail: résultat de ProgressStore.completeLevel).

import { StepValidator } from '../core/StepValidator.js';
import { ValidationEngine } from '../core/ValidationEngine.js';
import { CellView } from './CellView.js';

export class CellManager extends EventTarget {
    #deps;
    #stepValidator;
    #session = null;
    #passes = 0; // réussites du premier coup : alterne deux familles de messages pour varier

    /**
     * @param {object} deps
     * @param {import('../i18n/i18n.js').I18n} deps.i18n
     * @param {import('./NotebookView.js').NotebookView} deps.notebook
     * @param {import('../core/PyodideWorkerClient.js').PyodideWorkerClient} deps.client
     * @param {import('../core/ValidationEngine.js').ValidationEngine} deps.validator
     * @param {import('../core/ErrorTranslator.js').ErrorTranslator} deps.translator
     * @param {import('../core/AudioEngine.js').AudioEngine} deps.audio
     * @param {import('../core/ProgressStore.js').ProgressStore} deps.progress
     * @param {import('./BadgeToast.js').BadgeToast} deps.toast
     * @param {import('../core/GuideEngine.js').GuideEngine} deps.guide
     */
    constructor(deps) {
        super();
        this.#deps = deps;
        this.#stepValidator = new StepValidator({ client: deps.client, validator: deps.validator });
    }

    /**
     * Démarre (ou redémarre) un niveau à partir d'une LevelSession.
     * @param {object} [options]
     * @param {string} [options.greeting]  Situation du guide pour l'accueil ('level_start' ou 'welcome_back').
     */
    async start(session, { greeting = 'level_start' } = {}) {
        const { notebook, client, i18n } = this.#deps;
        this.#session = session;
        notebook.clear();
        notebook.setStatus(i18n.t('engine.loading'));
        try {
            await client.start();
            await client.reset();
        } catch {
            notebook.setStatus(i18n.t('engine.failed'));
            return;
        }
        notebook.setStatus('');
        notebook.addGuide(this.#say(greeting));
        this.#showCurrent();
    }

    #say(situation, params = {}) {
        return this.#deps.guide.say(situation, this.#deps.i18n.lang, params);
    }

    #showCurrent() {
        const session = this.#session;
        if (session.onMission) {
            this.#showMission();
        } else if (session.step.type === 'explain') {
            this.#showExplain(session.step);
        } else {
            this.#showCode(session.step);
        }
    }

    #announceProgress() {
        const { notebook, i18n } = this.#deps;
        const { index, stepCount } = this.#session;
        notebook.setStatus(i18n.t('step.progress', { current: Math.min(index + 1, stepCount), total: stepCount }));
    }

    #advance() {
        this.#session.next();
        this.#showCurrent();
    }

    #showExplain(step) {
        const { notebook, i18n } = this.#deps;
        this.#announceProgress();
        notebook.addExplain(step);
        notebook.addAction(i18n.t('step.continue'), () => this.#advance());
    }

    #showCode(step) {
        const { notebook, i18n } = this.#deps;
        this.#announceProgress();
        const cell = new CellView(i18n, step);
        notebook.add(cell.element);
        cell.focus();
        cell.addEventListener('stop', () => this.#stop(cell));
        cell.addEventListener('hint', () => cell.showGuide(this.#say('hint_revealed')));
        const state = { failures: 0 };
        let continueShown = false;
        cell.addEventListener('run', async (event) => {
            const passed = await this.#execute(cell, event.detail.code, step.tests, state);
            if (passed && !continueShown) {
                continueShown = true;
                notebook.addAction(i18n.t('step.continue'), () => this.#advance());
            }
        });
    }

    #showMission() {
        const { notebook, i18n } = this.#deps;
        const mission = this.#session.mission;
        notebook.setStatus(`${i18n.t('mission.label')} : ${mission.title}`);
        if (mission.tests.length === 0) {
            // Mission sans code (ex. niveau 00) : un simple bouton de validation.
            notebook.addExplain({ text: mission.goal, voice: false, image: null });
            notebook.addAction(i18n.t('mission.understand'), () => this.#completeLevel(mission));
            return;
        }
        const cell = new CellView(i18n, { starter: mission.starter, instruction: mission.goal });
        notebook.add(cell.element);
        cell.focus();
        cell.addEventListener('stop', () => this.#stop(cell));
        cell.addEventListener('hint', () => cell.showGuide(this.#say('hint_revealed')));
        const state = { failures: 0 };
        cell.addEventListener('run', async (event) => {
            if (await this.#execute(cell, event.detail.code, mission.tests, state)) {
                await this.#completeLevel(mission);
            }
        });
    }

    /** Deux échecs d'affilée et des indices encore cachés : le guide suggère un indice. */
    #struggling(cell, state) {
        return state.failures >= 2 && cell.hasHintsLeft;
    }

    #stop(cell) {
        // Ordre important : l'interruption doit être posée avant d'annuler la saisie en attente,
        // pour que Python reçoive KeyboardInterrupt plutôt qu'une fin de fichier.
        this.#deps.client.interrupt();
        cell.cancelInput();
    }

    /**
     * Exécute le code d'une cellule et valide. Renvoie vrai si tous les tests passent.
     * Les tests qui déclarent `inputs` rejouent le code, en isolation, avec ces saisies scriptées.
     */
    async #execute(cell, code, tests, state) {
        const { client, translator, audio, i18n } = this.#deps;
        await audio.unlock(); // le clic sur « Exécuter » est le geste utilisateur requis
        cell.clearOutput();
        cell.setBusy(true);
        let stdout = '';
        const onOutput = (text) => {
            stdout += text;
            cell.appendOutput(text);
        };
        const result = await client.run(code, {
            collect: ValidationEngine.variablesToCollect(tests),
            onStdout: onOutput,
            onStderr: onOutput,
            onInput: (prompt) => {
                cell.showGuide(this.#say('input_waiting'));
                return cell.requestInput(prompt);
            },
        });

        if (result.error) {
            cell.setBusy(false);
            cell.showError(translator.translate(result.error, i18n.lang));
            audio.play('error');
            if (result.error.type === 'KeyboardInterrupt') {
                cell.showGuide(this.#say('interrupted'));
            } else {
                state.failures += 1;
                cell.showGuide(this.#say(this.#struggling(cell, state) ? 'suggest_hint' : 'error_runtime'));
            }
            return false;
        }
        const validation = await this.#stepValidator.validate(code, tests, { stdout, result });
        cell.setBusy(false);
        cell.showValidation(validation);
        audio.play(validation.passed ? 'success_small' : 'error');
        if (validation.passed) {
            const first = state.failures === 0;
            this.#passes += first ? 1 : 0;
            cell.showGuide(this.#say(first ? (this.#passes % 2 === 1 ? 'success_first_try' : 'success_step') : 'success_after_retry'));
            state.failures = 0;
        } else {
            state.failures += 1;
            cell.showGuide(this.#say(this.#struggling(cell, state) ? 'suggest_hint' : 'fail_tests'));
        }
        return validation.passed;
    }

    async #completeLevel(mission) {
        const { progress, toast, audio, i18n, notebook } = this.#deps;
        const outcome = await progress.completeLevel(this.#session.id, this.#session.xp);
        audio.play(mission.rewardSound ?? 'success_small');
        toast.show(i18n.t(outcome.alreadyCompleted ? 'mission.already' : 'mission.done', { xp: outcome.xpGained }));
        for (const badge of outcome.newBadges) {
            toast.showBadge(badge);
        }
        notebook.setStatus(i18n.t('mission.done', { xp: outcome.xpGained }));
        notebook.addGuide(this.#say(outcome.alreadyCompleted ? 'level_complete_replay' : 'level_complete', { xp: outcome.xpGained }));
        if (!outcome.alreadyCompleted && outcome.streak.current >= 2) {
            notebook.addGuide(this.#say('streak', { days: outcome.streak.current }));
        }
        this.dispatchEvent(new CustomEvent('levelcomplete', { detail: outcome }));
    }
}
