// eslint.config.js
//
// ESLint configuration — the JS equivalent of PHP-CS-Fixer.
// Run it with:
//   npx eslint js/          # check all files
//   npx eslint js/ --fix    # auto-fix what can be fixed
//
// ESLint v9 uses "flat config" — one array of config objects
// instead of the old .eslintrc format. Each object applies rules
// to the files matched by its "files" pattern.

export default [
  {
    // Which files to lint
    files: ['js/**/*.js'],

    languageOptions: {
      // Tell ESLint we're writing for modern browsers, not Node.js.
      // This makes "document", "window", "fetch" etc. valid globals
      // without having to declare them.
      globals: {
        document:  'readonly',
        window:    'readonly',
        navigator: 'readonly',
        console:   'readonly',
        Date:      'readonly',
        JSON:      'readonly',
        parseInt:  'readonly',
        // OpenLayers global — loaded via CDN script tag
        ol:        'readonly',
      },
      parserOptions: {
        ecmaVersion: 2022,   // allows class private fields (#), optional chaining etc.
      },
    },

    rules: {
      // ── Errors — these are almost always bugs ───────────────────────────

      // Disallow == and != (use === and !== instead)
      // == has surprising type coercion: "0" == false is true
      'eqeqeq': ['error', 'always'],

      // Disallow unreachable code after return/throw/break
      'no-unreachable': 'error',

      // Disallow variables used before they are declared
      'no-use-before-define': ['error', { functions: false, classes: true }],

      // Disallow duplicate case labels in switch statements
      'no-duplicate-case': 'error',

      // Disallow calling a variable that is not a function
      'no-ex-assign': 'error',


      // ── Warnings — worth knowing about, not always wrong ────────────────

      // Warn on console.log left in code (fine during dev, not in production)
      'no-console': 'warn',

      // Warn on variables that are declared but never used
      // Functions are excluded because class methods are often "unused"
      // from ESLint's perspective but called from HTML or other files
      'no-unused-vars': ['warn', { vars: 'all', args: 'none' }],


      // ── Style — keep code consistent ────────────────────────────────────

      // Always use const when a variable is never reassigned
      'prefer-const': 'error',

      // Require === null checks instead of == null
      // (already covered by eqeqeq but explicit is clearer)
      'no-eq-null': 'error',

      // Disallow var — use let or const instead
      // var has function scope which causes subtle bugs; let/const have block scope
      'no-var': 'error',
    },
  },
];
