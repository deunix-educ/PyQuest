// Traduit une erreur Python (type + message) en explication simple, fr/en.
// La logique de reconnaissance est ici ; les textes sont dans app/js/i18n/errors.<lang>.json.

// Règles ordonnées : première correspondance gagnante. `params` nomme les groupes capturés.
const RULES = [
    { type: 'NameError', pattern: /name '(.+)' is not defined/, key: 'NameError', params: ['name'] },
    { type: 'UnboundLocalError', pattern: /local variable '(.+?)'/, key: 'UnboundLocalError', params: ['name'] },
    { type: 'SyntaxError', pattern: /unterminated (?:triple-quoted )?string literal/, key: 'SyntaxError.unterminated_string' },
    { type: 'SyntaxError', pattern: /'(.)' was never closed/, key: 'SyntaxError.never_closed', params: ['char'] },
    { type: 'SyntaxError', pattern: /unmatched '(.)'/, key: 'SyntaxError.unmatched', params: ['char'] },
    { type: 'SyntaxError', pattern: /expected ':'/, key: 'SyntaxError.expected_colon' },
    { type: 'SyntaxError', pattern: /Missing parentheses in call to 'print'/, key: 'SyntaxError.print_parens' },
    { type: 'SyntaxError', pattern: /Perhaps you forgot a comma/, key: 'SyntaxError.forgot_comma' },
    { type: 'SyntaxError', pattern: /invalid decimal literal/, key: 'SyntaxError.invalid_number' },
    { type: 'IndentationError', pattern: /expected an indented block/, key: 'IndentationError.expected_block' },
    { type: 'TypeError', pattern: /unsupported operand type\(s\) for (.+?): '(.+?)' and '(.+?)'/, key: 'TypeError.operand', params: ['op', 'left', 'right'] },
    { type: 'TypeError', pattern: /can only concatenate str \(not "(.+?)"\) to str/, key: 'TypeError.concat', params: ['other'] },
    { type: 'TypeError', pattern: /'(.+?)' object is not callable/, key: 'TypeError.not_callable', params: ['type'] },
    { type: 'TypeError', pattern: /(\w+)\(\) takes (.+?) positional arguments? but (\d+) (?:was|were) given/, key: 'TypeError.arg_count', params: ['fn', 'expected', 'given'] },
    { type: 'TypeError', pattern: /(\w+)\(\) missing (\d+) required positional arguments?/, key: 'TypeError.missing_arg', params: ['fn', 'count'] },
    { type: 'ValueError', pattern: /invalid literal for int\(\) with base 10: (.+)/, key: 'ValueError.invalid_int', params: ['value'] },
    { type: 'ValueError', pattern: /could not convert string to float: (.+)/, key: 'ValueError.invalid_float', params: ['value'] },
    { type: 'AttributeError', pattern: /'(.+?)' object has no attribute '(.+?)'/, key: 'AttributeError', params: ['type', 'attr'] },
    { type: 'ModuleNotFoundError', pattern: /No module named '(.+?)'/, key: 'ModuleNotFoundError', params: ['module'] },
    { type: 'KeyError', pattern: /^(.*)$/s, key: 'KeyError', params: ['key'] },
];

export class ErrorTranslator {
    #catalogs;
    #defaultLang;

    /**
     * @param {Record<string, Record<string, {title: string, explanation: string, tip: string}>>} catalogs
     *        Catalogues par langue (contenu de errors.fr.json, errors.en.json).
     * @param {string} [defaultLang]
     */
    constructor(catalogs, defaultLang = 'fr') {
        this.#catalogs = catalogs;
        this.#defaultLang = defaultLang;
    }

    /**
     * @param {{type: string, message: string, lineno: number|null, traceback: string}} error
     * @param {string} [lang]
     * @returns {{type: string, title: string, explanation: string, tip: string, line: number|null, traceback: string}}
     */
    translate(error, lang = this.#defaultLang) {
        const catalog = this.#catalogs[lang] ?? this.#catalogs[this.#defaultLang];
        const { key, params } = this.#match(error, catalog);
        const entry = catalog[key];
        return {
            type: error.type,
            title: this.#format(entry.title, params),
            explanation: this.#format(entry.explanation, params),
            tip: this.#format(entry.tip, params),
            line: error.lineno ?? null,
            // Traceback brut conservé pour l'affichage « voir le détail technique ».
            traceback: error.traceback ?? '',
        };
    }

    #match(error, catalog) {
        const message = error.message ?? '';
        for (const rule of RULES) {
            if (rule.type !== error.type) {
                continue;
            }
            const found = rule.pattern.exec(message);
            if (found && catalog[rule.key]) {
                const params = Object.fromEntries((rule.params ?? []).map((name, i) => [name, found[i + 1]]));
                return { key: rule.key, params };
            }
        }
        if (catalog[error.type]) {
            return { key: error.type, params: {} };
        }
        // Type d'erreur sans traduction dédiée : message générique avec le texte brut de Python.
        return { key: 'Unknown', params: { type: error.type, message } };
    }

    #format(template, params) {
        return template.replace(/\{(\w+)\}/g, (whole, name) => params[name] ?? whole);
    }
}
