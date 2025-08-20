// Flat ESLint config (ESM) for Cloud Functions
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  // ignore build output
  { ignores: ["lib/**", "generated/**"] },

  // base JS rules
  js.configs.recommended,

  // TypeScript rules
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        // If you later want type-aware rules, add:
        // project: ["./tsconfig.json", "./tsconfig.dev.json"],
        // tsconfigRootDir: new URL(".", import.meta.url),
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...(tsPlugin.configs.recommended?.rules || {}),
      quotes: ["error", "double"],
      indent: ["error", 2],
      "max-len": "off",
    },
  },
];
