import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import { defineConfig } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat['recommended-latest'],
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: false,
    jsx: true,
  }),
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // node:test's describe/it return promises the runner already tracks
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [
          { from: 'package', package: 'node:test', name: ['describe', 'it', 'suite', 'test'] },
        ],
      }],
    },
  },
)
