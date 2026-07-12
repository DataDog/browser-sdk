import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import * as tseslint from 'typescript-eslint'
import { importX } from 'eslint-plugin-import-x'
import unicornPlugin from 'eslint-plugin-unicorn'
import jsdocPlugin from 'eslint-plugin-jsdoc'
// @ts-expect-error -- eslint-plugin-jasmine is not typed
import jasmine from 'eslint-plugin-jasmine'
import globals from 'globals'
// eslint-disable-next-line local-rules/disallow-protected-directory-import
import eslintLocalRules from './eslint-local-rules/index.ts'
import { SCHEMAS } from './scripts/lib/generatedSchemaTypes.ts'

const SPEC_FILES = '**/*.{spec,specHelper}.{ts,tsx,js}'
const MONITOR_UNTIL_COMMENT_EXPIRED_LEVEL =
  (process.env.MONITOR_UNTIL_COMMENT_EXPIRED_LEVEL as 'warn' | 'error' | undefined) || 'warn'

/**
 * no-restricted-syntax rules for spec and source files included in packages/
 * This list is needed to avoid repeating the same rules in each eslint config block.
 */
const PACKAGES_NO_RESTRICTED_SYNTAX_RULES = [
  {
    selector: 'Identifier[name="globalThis"]',
    message: 'Use `globalObject` from @datadog/js-core/util instead of `globalThis`.',
  },
]

// eslint-disable-next-line import-x/no-default-export
export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    ignores: [
      ...SCHEMAS.map((schema) => schema.typesPath),
      'packages/*/bundle',
      'packages/*/cjs',
      'packages/*/esm',
      'test/**/dist',
      'test/**/.next',
      // Test-app webpack configs are build tooling for fixtures, not part of the typed project graph
      // (excluded from tsconfig.scripts.json). Without this, projectService fails to find a project.
      'test/apps/*/webpack.*',
      'test/apps/react-heavy-spa',
      'test/apps/react-shopist-like',
      'test/apps/microfrontend',
      'test/apps/nextjs',
      'test/apps/angular-app',
      'test/apps/vue-router-app',
      'test/apps/vue-router-v4-app',
      'test/apps/nuxt-app',
      'test/apps/nuxt-vue-router-v4-app',
      'test/apps/sf-lwc-app',
      'sandbox',
      'coverage',
      '.yarn',
      '**/playwright-report',
      'generated-docs',
      'developer-extension/.wxt',
      'developer-extension/dist',
      '.claude/worktrees',
    ],
  },

  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },

  {
    plugins: {
      unicorn: unicornPlugin,
      'local-rules': { rules: eslintLocalRules as Record<string, any> },
      jsdoc: jsdocPlugin,
      jasmine,
    },

    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },

    rules: {
      'arrow-body-style': 'error',
      camelcase: ['error', { properties: 'never' }],
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
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-undef-init': 'error',
      'no-unreachable': 'error',
      'no-useless-concat': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'preserve-caught-error': 'off', // disabled until our monitor tooling supports `error.cause`.
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
          'ts-check': false,
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
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
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
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'all', argsIgnorePattern: '^_', vars: 'all' }],
      '@typescript-eslint/triple-slash-reference': ['error', { path: 'always', types: 'prefer-import', lib: 'always' }],
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', name: ['describe', 'it', 'test'], package: 'node:test' }] },
      ],

      // Those lints are triggering false positives
      'import-x/default': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',

      'import-x/no-cycle': 'error',
      'import-x/no-default-export': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-extraneous-dependencies': 'error',
      'import-x/no-unresolved': [
        'error',
        {
          commonjs: true,
          ignore: [
            // The json-schema-to-typescript is built on demand (see scripts/cli build_json2type)
            // and is not always available in the node_modules. Skip the import check.
            'json-schema-to-typescript',
          ],
        },
      ],
      'import-x/no-useless-path-segments': 'error',
      'import-x/order': [
        'error',
        {
          // This is the default order plus 'internal', which is imports like
          // @datadog/browser-core/test (references a file/folder within a local package)
          // https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md#groups
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        },
      ],

      'jasmine/no-focused-tests': 'error',
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'error',
      'jsdoc/no-blank-blocks': 'error',
      'jsdoc/sort-tags': [
        'error',
        {
          linesBetween: 0,
          tagSequence: [
            {
              tags: [
                'category',
                'packageDocumentation',
                'internal',
                'deprecated',
                'experimental',
                'defaultValue',
                'param',
                'return',
                'returns',
                'see',
                'example',
              ],
            },
          ],
        },
      ],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-hyphen-before-param-description': 'error',
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
      'jsdoc/require-property-description': 'error',
      'jsdoc/require-property-name': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/multiline-blocks': 'error',

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

      'unicorn/filename-case': ['error', { case: 'camelCase', checkDirectories: false }],
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
        {
          leadingUnderscore: 'allow',
          selector: 'objectLiteralProperty',
          format: ['UPPER_CASE'],
        },
      ],
    },
  },

  {
    files: ['scripts/**'],
    rules: {
      'import-x/extensions': ['error', 'ignorePackages'],
    },
  },

  {
    files: ['scripts/**', 'packages/*/scripts/**'],
    ignores: ['**/lib/**'],
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase', checkDirectories: false }],
    },
  },

  {
    files: ['scripts/**', 'packages/*/scripts/**'],
    ignores: ['**/lib/**', SPEC_FILES],
    rules: {
      'local-rules/secure-command-execution': 'error',
      'local-rules/disallow-non-scripts': 'error',
    },
  },

  {
    // JS files. Allow weaker typings since TS can't infer types as accurately as TS files.
    files: ['**/*.{js,mjs}'],
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
    files: ['packages/**/*.ts'],
    rules: {
      'local-rules/disallow-spec-import': 'error',
      'jsdoc/no-types': 'error',
      'no-restricted-syntax': ['error', ...PACKAGES_NO_RESTRICTED_SYNTAX_RULES],
    },
  },

  {
    files: ['packages/*/src/**/*.ts'],
    ignores: [SPEC_FILES],
    rules: {
      'local-rules/enforce-monitor-until-comment': 'error',
      'local-rules/monitor-until-comment-expired': MONITOR_UNTIL_COMMENT_EXPIRED_LEVEL,
      'local-rules/disallow-side-effects': 'error',
      'local-rules/disallow-zone-js-patched-values': 'error',
      'local-rules/disallow-url-constructor-patched-values': 'error',
      'no-restricted-syntax': [
        'error',
        {
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
        {
          selector: 'TSModuleDeclaration[kind=global]',
          message: 'Never declare global types as it will leak to the user app global scope.',
        },

        ...PACKAGES_NO_RESTRICTED_SYNTAX_RULES,
      ],
    },
  },

  {
    files: ['packages/*/src/**/*.ts'],
    ignores: [SPEC_FILES],
    rules: {
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    },
  },

  {
    files: ['packages/{browser-rum,browser-logs,browser-rum-slim}/src/entries/*.ts'],
    rules: {
      'local-rules/disallow-enum-exports': 'error',
    },
  },

  {
    // Files executed by nodejs
    files: [
      'scripts/**',
      'test/**/*.js',
      'eslint-local-rules/**/*.ts',
      'eslint.config.ts',
      'packages/*/scripts/**/*.js',
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'unicorn/prefer-node-protocol': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'glob',
              message: 'Use node:fs or node:fs/promises (fs.glob) instead.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/webpack.*.{ts,mts}', 'eslint-local-rules/**/*.ts'],
    rules: {
      // Webpack configuration files and eslint rules files are expected to use a default export.
      'import-x/no-default-export': 'off',
    },
  },

  {
    files: ['test/e2e/**/*.ts', 'test/performance/**/*.ts'],
    rules: {
      // E2E codebase is importing @datadog/browser-* packages referenced by tsconfig.
      'import-x/no-extraneous-dependencies': 'off',
    },
  },

  {
    files: ['packages/browser-core/src/tools/**/*.ts'],
    ignores: [SPEC_FILES],
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
