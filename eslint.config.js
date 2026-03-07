// @ts-check
/**
 * ESLint Flat Configuration for Claude Code Conductor (C3)
 *
 * This configuration uses the modern ESLint flat config format (ESLint 9+).
 * It sets up TypeScript-specific rules with a focus on:
 * - Type safety (no-explicit-any, strict-boolean-expressions)
 * - Code quality (no-unused-vars, prefer-const)
 * - Security (no-eval, no-implied-eval)
 * - Consistency (consistent-type-imports)
 *
 * Run: npm run lint
 * Fix: npm run lint:fix
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.conductor/**',
      'coverage/**',
      '*.js',           // Ignore compiled JS in root
      '!eslint.config.js', // But not this config file
    ],
  },

  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript-ESLint recommended rules
  ...tseslint.configs.recommended,

  // Main configuration for TypeScript files
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // ============================================
      // TYPE SAFETY RULES
      // ============================================

      // Disallow explicit any - forces proper typing
      // TODO(audit): Many violations exist in codebase; enable after cleanup
      '@typescript-eslint/no-explicit-any': 'warn',

      // Require explicit return types on exported functions
      // Helps with API contracts and documentation
      '@typescript-eslint/explicit-function-return-type': 'off', // Too verbose for this codebase

      // Require explicit member accessibility modifiers
      '@typescript-eslint/explicit-member-accessibility': 'off', // Not using class-based patterns heavily

      // ============================================
      // CODE QUALITY RULES
      // ============================================

      // Disallow unused variables (TypeScript-aware version)
      // Allows underscore prefix for intentionally unused vars
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Disable base rule in favor of TypeScript version
      'no-unused-vars': 'off',

      // Require const declarations for variables that are never reassigned
      'prefer-const': 'warn',

      // Disallow var declarations - use let or const
      'no-var': 'error',

      // Require consistent type imports
      // Ensures type-only imports use 'import type' syntax
      '@typescript-eslint/consistent-type-imports': ['warn', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
        disallowTypeAnnotations: false,
      }],

      // Disallow empty functions (except for allowed patterns)
      '@typescript-eslint/no-empty-function': ['warn', {
        allow: ['arrowFunctions', 'private-constructors', 'protected-constructors'],
      }],

      // ============================================
      // SECURITY RULES
      // ============================================

      // Disallow eval() - security risk (code injection)
      'no-eval': 'error',

      // Disallow implied eval through setTimeout/setInterval strings
      'no-implied-eval': 'error',

      // Disallow new Function() - similar to eval
      'no-new-func': 'error',

      // Disallow script URLs - XSS risk
      'no-script-url': 'error',

      // ============================================
      // ASYNC/PROMISE RULES
      // ============================================

      // Require await in async functions
      // Note: Many async functions don't need await (returning promises)
      'require-await': 'off',

      // Disallow floating promises (must be awaited or handled)
      '@typescript-eslint/no-floating-promises': 'warn',

      // Require promise rejections to be Error objects
      '@typescript-eslint/no-misused-promises': ['warn', {
        checksVoidReturn: {
          arguments: false, // Allow void-returning callbacks
        },
      }],

      // ============================================
      // ERROR HANDLING RULES
      // ============================================

      // Disallow throwing literals - throw Error objects instead
      '@typescript-eslint/only-throw-error': 'warn',

      // Require try-catch error parameter to be used
      '@typescript-eslint/no-unused-expressions': 'warn',

      // ============================================
      // STYLE & FORMATTING RULES
      // ============================================

      // Consistent brace style
      // TODO(audit): Many single-statement if/else without braces; enable after cleanup
      'curly': 'off',

      // Require strict equality
      'eqeqeq': ['warn', 'always', { null: 'ignore' }],

      // No console.log in production code (use logger instead)
      // Note: Console is used extensively; would need logger refactor
      'no-console': 'off',

      // Disable rules that are too noisy for the current codebase
      // These can be enabled after cleanup
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',

      // Preserve caught error causes - too strict for existing patterns
      'preserve-caught-error': 'off',

      // ============================================
      // TYPESCRIPT-SPECIFIC ALLOWANCES
      // ============================================

      // Allow non-null assertions (!) - common in TypeScript
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Allow require imports (needed for some Node patterns)
      '@typescript-eslint/no-require-imports': 'warn',

      // Allow namespace declarations (used in type definitions)
      '@typescript-eslint/no-namespace': 'off',
    },
  },

  // Test file configuration - more relaxed rules
  {
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    rules: {
      // Allow any in tests for mocking flexibility
      '@typescript-eslint/no-explicit-any': 'off',

      // Allow floating promises in tests (vitest handles them)
      '@typescript-eslint/no-floating-promises': 'off',

      // Allow non-null assertions in tests
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Allow unused expressions for testing assertions
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
