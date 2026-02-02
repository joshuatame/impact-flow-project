/**
 * functions/eslint.config.cjs
 *
 * Local flat ESLint config for Firebase Functions.
 * This prevents the repo root eslint.config.js (browser/module) from linting Node/require code.
 */
"use strict";

module.exports = [
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
      "quotes": ["error", "double", { allowTemplateLiterals: true }],
      "no-empty": "error",
    },
  },
];
