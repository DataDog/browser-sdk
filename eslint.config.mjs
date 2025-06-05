// @ts-check .ts config files are still experimental: https://github.com/eslint/eslint/discussions/17726

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
// @ts-expect-error no types available
import importPlugin from 'eslint-plugin-import'
import unicornPlugin from 'eslint-plugin-unicorn'
import jsdocPlugin from 'eslint-plugin-jsdoc'
import jasmine from 'eslint-plugin-jasmine'
import globals from 'globals'
// eslint-disable-next-line local-rules/disallow-protected-directory-import
import eslintLocalRules from './eslint-local-rules/index.js'

const SPEC_FILES = '**/*.{spec,specHelper}.{ts,tsx,js}'

// eslint-disable-next-line import/no-default-export
export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  {
    ignores: [
      'packages/*/bundle',
      'packages/*/cjs',
      'packages/*/esm',
      'developer-extension/dist',
      'test/**/dist',
      'test/apps/base-extension/**',
      'test/apps/allowed-tracking-origin/**',
      'test/apps/invalid-tracking-origin/**',
      'sandbox',
      'coverage',
      'rum-events-format',
      '.yarn',
    ],
  },

  {
    plugins: {
      unicorn: unicornPlugin,
      'local-rules': { rules: eslintLocalRules },
      jsdoc: jsdocPlugin,
      jasmine,
    },

    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.json',
          './test/apps/**/tsconfig.json',
          './test/e2e/tsconfig.json',
          './developer-extension/tsconfig.json',
          './performances/tsconfig.json',
        ],
        sourceType: 'module',

        // Without this option, typescript-eslint fails to lint .js files because we don't use
        // `allowJs: true` in the TypeScript configuration. Same issue as
        // https://github.com/typescript-eslint/typescript-eslint/issues/9749.
        //
        // Enabling `allowJs` would be a better solution, but right now it's not possible because of a
        // pretty small reason with big implications: `webpack.base.js` includes
        // `tsconfig-paths-webpack-plugin`, and this file includes Node.js types via a <reference>
        // directive (see https://unpkg.com/browse/tsconfig-paths-webpack-plugin@4.2.0/lib/plugin.d.ts).
        //
        // Because of this, Node.js types are included in the whole project, and because some of them
        // are slightly different from the DOM/Browser types, some annoying typecheck errors are raised.
        //
        // So, ideally, we should:
        // * add `allowJs: true` in the TypeScript configuration
        // * have different tsconfig.json configurations for packages and scripts
        // * when typechecking, run `tsc` multiple time with each configuration (like we do for the
        //   developer-extension)
        // * then remove this option
        disallowAutomaticSingleRunInference: true,
      },
    },

    rules: {
      'arrow-body-style': 'error',
      camelcase: ['error', { properties: 'never', allow: ['_dd_temp_'] }],
      curly: 'error',
      eqeqeq: ['error', 'smart'],
      'guard-for-in': 'error',
      'id-denylist': [
        'error',
        'any',
        'Number',
        'number',
        'String',
        'string',
        'Boolean',
        'boolean',
        'Undefined',
        'undefined',
      ],
      'id-match': 'error',
      'no-bitwise': 'error',
      'no-caller': 'error',
      'no-else-return': 'error',
      'no-eq-null': 'error',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-inner-declarations': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-return-await': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-undef-init': 'error',
      'no-unreachable': 'error',
      'no-useless-concat': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-rest-params': 'off',
      'prefer-template': 'error',
      'prefer-object-spread': 'error',
      quotes: ['error', 'single', { avoidEscape: true }],
      radix: 'error',
      'require-await': 'error',
      'spaced-comment': [
        'error',
        'always',
        {
          line: {
            markers: ['/'],
          },
          block: {
            balanced: true,
          },
        },
      ],

      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
          'ts-check': 'allow-with-description',
        },
      ],
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            /* eslint-disable id-denylist */
            Object: { message: 'Avoid using the `Object` type. Did you mean `object`?' },
            Boolean: { message: 'Avoid using the `Boolean` type. Did you mean `boolean`?' },
            Number: { message: 'Avoid using the `Number` type. Did you mean `number`?' },
            String: { message: 'Avoid using the `String` type. Did you mean `string`?' },
            Symbol: { message: 'Avoid using the `Symbol` type. Did you mean `symbol`?' },
            /* eslint-enable id-denylist */
          },
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['error'],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: {
            memberTypes: [
              'signature',
              'public-static-field',
              'protected-static-field',
              'private-static-field',
              'public-decorated-field',
              'public-instance-field',
              'public-abstract-field',
              'protected-decorated-field',
              'protected-instance-field',
              'protected-abstract-field',
              'private-decorated-field',
              'private-instance-field',
              'public-constructor',
              'protected-constructor',
              'private-constructor',
              'public-static-method',
              'protected-static-method',
              'private-static-method',
              'public-decorated-method',
              'public-instance-method',
              'public-abstract-method',
              'protected-decorated-method',
              'protected-instance-method',
              'protected-abstract-method',
              'private-decorated-method',
              'private-instance-method',
            ],
            order: 'as-written',
          },
        },
      ],
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'all', argsIgnorePattern: '^_', vars: 'all' }],
      '@typescript-eslint/triple-slash-reference': ['error', { path: 'always', types: 'prefer-import', lib: 'always' }],

      'import/no-cycle': 'error',
      'import/no-default-export': 'error',
      'import/no-duplicates': 'error',
      'import/no-extraneous-dependencies': 'error',
      'import/no-unresolved': [
        'error',
        {
          commonjs: true,
          ignore: [
            // typescript-eslint package has no 'main' field, only 'exports', but
            // eslint-plugin-import doesn't support it. See:
            // * https://github.com/import-js/eslint-plugin-import/issues/3088#issuecomment-2425233952
            // * https://github.com/browserify/resolve/issues/222
            'typescript-eslint',

            // The json-schema-to-typescript is built on demand (see scripts/cli build_json2type)
            // and is not always available in the node_modules. Skip the import check.
            'json-schema-to-typescript',
          ],
        },
      ],
      'import/no-useless-path-segments': 'error',
      'import/order': 'error',

      'jasmine/no-focused-tests': 'error',

      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'error',

      'local-rules/disallow-test-import-export-from-src': 'error',
      'local-rules/disallow-generic-utils': 'error',
      'local-rules/disallow-protected-directory-import': [
        'error',
        {
          ignore: [
            // ignore packages index files so `[...]/test/*` can import from the `[...]/src/*`
            'packages/*/src/index.ts',
          ],
        },
      ],

      'unicorn/filename-case': ['error', { case: 'camelCase' }],
      'unicorn/no-empty-file': 'error',
    },
  },

  {
    files: ['**/*Event.types.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          leadingUnderscore: 'allow',
          selector: 'property',
          format: ['snake_case'],
        },
      ],
    },
  },

  {
    files: ['scripts/**/*.js', 'packages/*/scripts/**/*.js'],
    ignores: ['**/lib/**'],
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    },
  },

  {
    files: ['scripts/**/*.js', 'packages/*/scripts/**/*.js'],
    ignores: ['**/lib/**', SPEC_FILES],
    rules: {
      'local-rules/secure-command-execution': 'error',
      'local-rules/disallow-non-scripts': 'error',
    },
  },

  {
    // JS files. Allow weaker typings since TS can't infer types as accurately as TS files.
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  // All "production files" = files that are used by Browser SDK users
  {
    files: ['packages/*/src/**/*', 'developer-extension/src/**/*'],
    ignores: [SPEC_FILES],
    rules: {
      'local-rules/enforce-prod-deps-imports': ['error'],
    },
  },

  {
    files: ['packages/*/src/**/*.ts', 'developer-extension/src/**/*.{tsx,ts}'],
    rules: {
      'no-console': 'error',
    },
  },

  {
    files: ['packages/*/src/**/*.ts'],
    ignores: [SPEC_FILES],
    rules: {
      'local-rules/disallow-side-effects': 'error',
      'local-rules/disallow-zone-js-patched-values': 'error',
      'local-rules/disallow-url-constructor-patched-values': 'error',
      'no-restricted-syntax': [
        'error',
        {
          // Using classes seems to increase bundle size. See
          // https://github.com/DataDog/browser-sdk/pull/2885
          selector: 'ClassDeclaration',
          message: 'Classes are not allowed. Use functions instead.',
        },
        {
          selector: 'ArrayExpression > SpreadElement',
          message: 'Array spread is not authorized. Please use .concat instead.',
        },
        {
          selector: 'MemberExpression[object.name="Date"][property.name="now"]',
          message: '`Date.now()` is not authorized. Please use `dateNow()` instead',
        },
        {
          selector: 'TSEnumDeclaration:not([const=true])',
          message: 'When possible, use `const enum` as it produces less code when transpiled.',
        },
      ],
    },
  },

  {
    files: ['packages/**/*.ts'],
    rules: {
      'local-rules/disallow-spec-import': 'error',
    },
  },

  {
    files: ['packages/{rum,logs,flagging,rum-slim}/src/entries/*.ts'],
    rules: {
      'local-rules/disallow-enum-exports': 'error',
    },
  },

  {
    // Files executed by nodejs
    files: [
      '**/webpack.*.js',
      'scripts/**/*.js',
      'test/**/*.js',
      'eslint-local-rules/**/*.js',
      'eslint.config.mjs',
      'packages/*/scripts/**/*.js',
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['test/e2e/**/*.ts'],
    rules: {
      // E2E codebase is importing @datadog/browser-* packages referenced by tsconfig.
      'import/no-extraneous-dependencies': 'off',
    },
  },

  {
    files: ['packages/core/src/tools/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**/boot/*', '../**/browser/*', '../**/domain/*', '../**/transport/*'],
              message: 'tools components should not import from other directories',
            },
          ],
        },
      ],
    },
  }
)
