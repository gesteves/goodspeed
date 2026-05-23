import { defineConfig, globalIgnores } from "eslint/config";
import astro from "eslint-plugin-astro";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // env.d.ts uses triple-slash references to bring in Astro + Vite types,
    // which is the documented Astro pattern.
    files: ["src/env.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },
  {
    // Inline analytics shims in .astro files mirror upstream snippets
    // verbatim (Plausible uses `arguments` deliberately). Not our code.
    files: ["**/*.astro/*.js", "**/*.astro/*.ts", "**/*.astro"],
    rules: { "prefer-rest-params": "off" },
  },
  globalIgnores([
    "dist/**",
    ".astro/**",
    ".netlify/**",
    "node_modules/**",
  ]),
]);

export default eslintConfig;
