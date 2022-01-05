module.exports = {
  env: {
    browser: true,
    jasmine: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/typescript',
    'prettier',
    'prettier/@typescript-eslint',
    'plugin:import/typescript',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: [
      './tsconfig.json',
      './test/app/tsconfig.json',
      './test/e2e/tsconfig.json',
      './developer-extension/tsconfig.json',
      './performances/tsconfig.json',
    ],
    sourceType: 'module',
  },
  plugins: [
    'eslint-plugin-import',
    'jasmine',
    'eslint-plugin-jsdoc',
    'eslint-plugin-prefer-arrow',
    'eslint-plugin-unicorn',
    '@typescript-eslint',
    'eslint-plugin-local-rules',
  ],
  rules: {
    'arrow-body-style': 'error',
    camelcase: ['error', { properties: 'never', allow: ['_dd_temp_'] }],
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
    'max-len': ['error', { code: 120, ignoreUrls: true }],
    'no-bitwise': 'error',
    'no-caller': 'error',
    'no-duplicate-imports': 'error',
    'no-else-return': 'error',
    'no-eq-null': 'error',
    'no-eval': 'error',
    'no-extra-bind': 'error',
    'no-new-func': 'error',
    'no-new-wrappers': 'error',
    'no-return-await': 'error',
    'no-sequences': 'error',
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
    'no-undef-init': 'error',
    'object-shorthand': 'error',
    'one-var': ['error', 'never'],
    'prefer-rest-params': 'off',
    'prefer-object-spread': 'error',
    'prefer-template': 'error',
    radix: 'error',
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
    '@typescript-eslint/ban-types': [
      'error',
      {
        types: {
          /* eslint-disable id-denylist */
          Object: { message: 'Avoid using the `Object` type. Did you mean `object`?' },
          object: false,
          Function: { message: 'Avoid using the `Function` type. Prefer a specific function type, like `() => void`.' },
          Boolean: { message: 'Avoid using the `Boolean` type. Did you mean `boolean`?' },
          Number: { message: 'Avoid using the `Number` type. Did you mean `number`?' },
          String: { message: 'Avoid using the `String` type. Did you mean `string`?' },
          Symbol: { message: 'Avoid using the `Symbol` type. Did you mean `symbol`?' },
          /* eslint-enable id-denylist */
        },
      },
    ],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
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
            'private-abstract-field',
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
            'private-abstract-method',
          ],
          order: 'as-written',
        },
      },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { args: 'all', argsIgnorePattern: '^_', vars: 'all' }],
    '@typescript-eslint/triple-slash-reference': ['error', { path: 'always', types: 'prefer-import', lib: 'always' }],

    'import/no-default-export': 'error',
    'import/no-extraneous-dependencies': 'error',
    'import/no-unresolved': 'error',
    'import/no-useless-path-segments': 'error',
    'import/order': 'error',

    'jasmine/no-focused-tests': 'error',

    'jsdoc/check-alignment': 'error',
    'jsdoc/check-indentation': 'error',

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
  },
  overrides: [
    {
      files: ['**/*.types.ts', '**/types.ts'],
      rules: {
        camelcase: 'off',
      },
    },
    {
      files: ['scripts/**/*.js'],
      rules: {
        'unicorn/filename-case': ['error', { case: 'kebabCase' }],
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
    {
      files: ['packages/*/src/**/*.ts'],
      rules: {
        'no-console': 'error',
      },
    },
    {
      files: ['packages/*/src/**/*.ts'],
      excludedFiles: '*.spec.ts',
      rules: {
        'local-rules/disallow-side-effects': 'error',
      },
    },
    {
      files: ['packages/**/*.ts'],
      rules: {
        'local-rules/disallow-spec-import': 'error',
      },
    },
    {
      files: ['packages/{rum,logs,rum-slim}/src/entries/*.ts'],
      rules: {
        'local-rules/disallow-enum-exports': 'error',
      },
    },
    {
      // Files executed by nodejs
      files: ['**/webpack.*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint-local-rules/**/*.js', '.eslintrc.js'],
      env: {
        node: true,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      files: ['test/e2e/**/*.ts'],
      rules: {
        // E2E codebase is importing @datadog/browser-* packages referenced by tsconfig.
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
}
