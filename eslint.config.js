// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "android/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "tools/mapgen/.cache/**",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: false,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/sim/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/render/**", "**/render", "src/render*"],
              message: "src/sim must not import from src/render (sim must stay pure and DOM-free).",
            },
            {
              group: ["**/ui/**", "**/ui", "src/ui*"],
              message: "src/sim must not import from src/ui (sim must stay pure and DOM-free).",
            },
          ],
        },
      ],
    },
  },
];
