import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^[A-Z_]',
        varsIgnorePattern: '^(motion|[A-Z_])',
      }],
    },
  },
  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: [
      'src/components/Marketplace/shared/MarketplaceVerification.jsx',
      'src/components/shared/AddressAreaValidation.jsx',
      'src/components/shared/SlideTransition.jsx',
      'src/components/shared/motion.jsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
