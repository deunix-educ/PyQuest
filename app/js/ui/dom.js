// Helpers DOM : construction d'éléments sans jamais passer par innerHTML (contenus de niveaux non fiables).

/** Crée un élément. `attrs` : propriétés DOM ou attributs ; les enfants sont des nœuds ou des chaînes. */
export function el(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) {
            continue;
        }
        if (name === 'class') {
            element.className = value;
        } else if (name.startsWith('on') && typeof value === 'function') {
            element.addEventListener(name.slice(2), value);
        } else if (name === 'text') {
            element.textContent = value;
        } else {
            element.setAttribute(name, value === true ? '' : String(value));
        }
    }
    element.append(...children.flat().filter((child) => child !== null && child !== undefined));
    return element;
}

/** Transforme un texte avec `code` inline (backticks) en fragment de nœuds, sans HTML interprété. */
export function renderInline(text) {
    const fragment = document.createDocumentFragment();
    text.split('`').forEach((part, index) => {
        if (part === '') {
            return;
        }
        fragment.append(index % 2 === 1 ? el('code', { text: part }) : document.createTextNode(part));
    });
    return fragment;
}

let counter = 0;

/** Identifiant unique pour relier labels et champs. */
export function uniqueId(prefix) {
    counter += 1;
    return `${prefix}-${counter}`;
}
