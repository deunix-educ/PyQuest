// Dessin de la chouette-guide (SVG constant, aux couleurs du thème via les classes CSS de guide.css).
// L'humeur (neutral, happy, thinking, celebrate) est portée par l'attribut data-mood du conteneur.

const OWL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" class="owl" aria-hidden="true" focusable="false">
    <g class="owl-wings">
        <ellipse class="owl-body" cx="17" cy="54" rx="9" ry="21" transform="rotate(-22 17 54)"/>
        <ellipse class="owl-body" cx="103" cy="54" rx="9" ry="21" transform="rotate(22 103 54)"/>
    </g>
    <ellipse class="owl-body" cx="60" cy="68" rx="38" ry="42"/>
    <path class="owl-body" d="M30 38 L38 14 L52 30 Z M90 38 L82 14 L68 30 Z"/>
    <ellipse class="owl-belly" cx="60" cy="92" rx="22" ry="14"/>
    <circle class="owl-eye" cx="44" cy="58" r="15"/>
    <circle class="owl-eye" cx="76" cy="58" r="15"/>
    <g class="eyes-round">
        <circle class="owl-pupil" cx="46" cy="59" r="7"/>
        <circle class="owl-pupil" cx="74" cy="59" r="7"/>
        <circle class="owl-glint" cx="48" cy="56" r="2.2"/>
        <circle class="owl-glint" cx="76" cy="56" r="2.2"/>
    </g>
    <g class="eyes-happy">
        <path class="owl-line" d="M35 61 Q44 49 53 61"/>
        <path class="owl-line" d="M67 61 Q76 49 85 61"/>
    </g>
    <g class="eyes-thinking">
        <circle class="owl-pupil" cx="50" cy="54" r="7"/>
        <circle class="owl-pupil" cx="80" cy="54" r="7"/>
        <circle class="owl-glint" cx="52" cy="51" r="2.2"/>
        <circle class="owl-glint" cx="82" cy="51" r="2.2"/>
        <path class="owl-line" d="M30 38 L56 43"/>
    </g>
    <path class="owl-beak" d="M54 72 L66 72 L60 84 Z"/>
    <g class="owl-sparkles">
        <path class="owl-spark" d="M8 14 L11 22 L19 25 L11 28 L8 36 L5 28 L-3 25 L5 22 Z" transform="translate(6 -2) scale(.7)"/>
        <path class="owl-spark" d="M8 14 L11 22 L19 25 L11 28 L8 36 L5 28 L-3 25 L5 22 Z" transform="translate(92 4) scale(.55)"/>
    </g>
</svg>`;

/** Crée un nouvel élément SVG de chouette. */
export function createOwl() {
    // Marque constante (jamais construite à partir de données externes) : l'analyse DOM est sûre.
    const document_ = new DOMParser().parseFromString(OWL_SVG, 'image/svg+xml');
    return document.importNode(document_.documentElement, true);
}
