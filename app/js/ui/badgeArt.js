// Médailles illustrées des badges (SVG constants). Couleurs via guide/progress.css : obtenu = coloré,
// à débloquer = silhouette grise. Le sens ne repose jamais sur le dessin seul (nom + état en texte).

import { svg } from './dom.js';

const ICONS = {
    // Pousse : le premier pas.
    first_level: `<path class="badge-icon" d="M30 46 V31 H34 V46 Z"/>
        <path class="badge-icon" d="M32 37 C21 37 17 30 16 23 C26 23 31 28 32 37 Z"/>
        <path class="badge-icon" d="M32 33 C43 33 47 26 48 19 C38 19 33 24 32 33 Z"/>
        <path class="badge-icon" d="M22 47 H42 V50 H22 Z"/>`,
    // Escalier : trois niveaux.
    three_levels: `<rect class="badge-icon" x="13" y="37" width="11" height="12" rx="2"/>
        <rect class="badge-icon" x="26.5" y="29" width="11" height="20" rx="2"/>
        <rect class="badge-icon" x="40" y="20" width="11" height="29" rx="2"/>`,
    // Étoile : 100 XP.
    xp_100: `<polygon class="badge-icon" points="32,13 37.7,25.9 51.8,27.3 41.2,36.7 44.3,50.5 32,43.3 19.7,50.5 22.8,36.7 12.2,27.3 26.3,25.9"/>`,
    // Flamme : 3 jours de suite.
    streak_3: `<path class="badge-icon" d="M32 13 C35 23 44 27 44 38 C44 46 38.5 52 32 52 C25.5 52 20 46 20 38 C20 32 23.5 28.5 25.5 22 C28 26 30.5 25 32 13 Z"/>
        <path class="badge-inner" d="M32 33 C34 38 38 40 38 45 C38 48.5 35.4 50 32 50 C28.6 50 26 48.5 26 45 C26 41.5 30 39 32 33 Z"/>`,
    // Grande flamme + étincelles : 7 jours de suite.
    streak_7: `<path class="badge-icon" d="M32 11 C36 22 46 26 46 38 C46 47 39.5 53 32 53 C24.5 53 18 47 18 38 C18 31.5 22 27.5 24.5 20 C27.5 24.5 30.5 23.5 32 11 Z"/>
        <path class="badge-inner" d="M32 32 C34.5 38 39 40.5 39 46 C39 49.5 36 51.3 32 51.3 C28 51.3 25 49.5 25 46 C25 42 29.5 39 32 32 Z"/>
        <path class="badge-spark" d="M50 12 L51.8 17 L57 18.8 L51.8 20.6 L50 26 L48.2 20.6 L43 18.8 L48.2 17 Z"/>
        <path class="badge-spark" d="M12 22 L13.2 25.4 L16.6 26.6 L13.2 27.8 L12 31.2 L10.8 27.8 L7.4 26.6 L10.8 25.4 Z"/>`,
};

/** Identifiants des badges dotés d'une illustration (comparés aux badges réels par les tests). */
export const BADGE_ICON_IDS = Object.keys(ICONS);

/** Crée la médaille d'un badge ; `earned` choisit le rendu coloré ou la silhouette grise. */
export function createBadgeIcon(id, { earned }) {
    const icon = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="badge-art ${earned ? 'is-earned' : 'is-locked'}" aria-hidden="true" focusable="false">
        <circle class="badge-ring" cx="32" cy="32" r="30"/>
        <circle class="badge-disc" cx="32" cy="32" r="26"/>
        ${ICONS[id] ?? ICONS.xp_100}
    </svg>`);
    return icon;
}
