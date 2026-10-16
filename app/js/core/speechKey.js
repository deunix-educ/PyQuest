// Clé de narration : relie un texte de niveau à son fichier audio pré-généré.
// Doit rester strictement identique à scripts/voice_key.py (vecteurs de test communs).

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** Texte réellement lu : sans backticks Markdown, espaces normalisés. */
export function speechText(text) {
    return text.replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/** Empreinte FNV-1a 64 bits (16 caractères hexadécimaux) de la langue et du texte lu. */
export function speechKey(lang, text) {
    let value = FNV_OFFSET;
    for (const byte of new TextEncoder().encode(`${lang}\n${speechText(text)}`)) {
        value = ((value ^ BigInt(byte)) * FNV_PRIME) & MASK;
    }
    return value.toString(16).padStart(16, '0');
}
