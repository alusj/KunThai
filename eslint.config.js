import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'android/**/build/**',
    'android/app/src/main/assets/**',
    'android/capacitor-cordova-android-plugins/**',
    'ios/App/App/public/**',
  ]),
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
    // Node contexts: serverless handlers, shared server modules, and the Vite
    // config (which runs in the dev server process, not the browser).
    files: ['api/**/*.js', 'server/**/*.js', 'vite.config.js'],
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
  {
    // NearbyAreaMap is frozen (a unit test fails on any edit to it), so its
    // one unused easing helper stays visible as a warning instead of failing CI.
    files: ['src/components/transport/area/NearbyAreaMap.jsx'],
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^[A-Z_]',
        varsIgnorePattern: '^(motion|[A-Z_])',
      }],
    },
  },
])
