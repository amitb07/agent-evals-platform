import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/', '**/generated/', 'data/', 'spike/'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['apps/web/**/*.{ts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/**/*.vue'],
    extends: [tseslint.configs.recommended, vue.configs['flat/recommended']],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['apps/{api,worker}/**/*.ts', 'packages/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
