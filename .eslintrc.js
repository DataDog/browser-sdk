module.exports = {
  env: {
    browser: true,
    jasmine: true,
  },
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
    'prettier/@typescript-eslint',
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
          /* eslint-disable id-blacklist */
          Object: { message: 'Avoid using the `Object` type. Did you mean `object`?' },
          object: false,
          Function: { message: 'Avoid using the `Function` type. Prefer a specific function type, like `() => void`.' },
          Boolean: { message: 'Avoid using the `Boolean` type. Did you mean `boolean`?' },
          Number: { message: 'Avoid using the `Number` type. Did you mean `number`?' },
          String: { message: 'Avoid using the `String` type. Did you mean `string`?' },
          Symbol: { message: 'Avoid using the `Symbol` type. Did you mean `symbol`?' },
          /* eslint-enable id-blacklist */
        },
      },
    ],
    '@typescript-eslint/explicit-member-accessibility': ['off', { accessibility: 'explicit' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/indent': 'off',
    '@typescript-eslint/member-delimiter-style': 'off',
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
    '@typescript-eslint/naming-convention': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-extra-semi': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-parameter-properties': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { args: 'all', argsIgnorePattern: '^_', vars: 'all' }],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/promise-function-async': 'off',
    '@typescript-eslint/quotes': 'off',
    '@typescript-eslint/semi': 'off',
    '@typescript-eslint/triple-slash-reference': ['error', { path: 'always', types: 'prefer-import', lib: 'always' }],
    '@typescript-eslint/type-annotation-spacing': 'off',
    'arrow-body-style': 'error',
    'arrow-parens': 'off',
    'brace-style': 'off',
    'comma-dangle': 'off',
    complexity: 'off',
    'constructor-super': 'error',
    curly: 'error',
    'eol-last': 'off',
    eqeqeq: ['error', 'smart'],
    'guard-for-in': 'error',
    'id-blacklist': [
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
    'import/no-default-export': 'error',
    'import/order': 'error',
    'jasmine/no-focused-tests': 'error',
    'jsdoc/check-alignment': 'error',
    'jsdoc/check-indentation': 'error',
    'jsdoc/newline-after-description': 'off',
    'linebreak-style': 'off',
    'max-classes-per-file': 'off',
    'max-len': ['error', { code: 120 }],
    'new-parens': 'off',
    'newline-per-chained-call': 'off',
    'no-array-constructor': 'off',
    'no-bitwise': 'error',
    'no-caller': 'error',
    'no-cond-assign': 'error',
    'no-console': 'off',
    'no-debugger': 'error',
    'no-duplicate-case': 'error',
    'no-duplicate-imports': 'error',
    'no-else-return': 'error',
    'no-empty': 'error',
    'no-empty-function': 'off',
    'no-eval': 'error',
    'no-extra-bind': 'error',
    'no-extra-semi': 'off',
    'no-fallthrough': 'off',
    'no-implied-eval': 'off',
    'no-invalid-this': 'off',
    'no-irregular-whitespace': 'off',
    'no-multiple-empty-lines': 'off',
    'no-new-func': 'error',
    'no-new-wrappers': 'error',
    'no-param-reassign': 'off',
    'no-redeclare': 'off',
    'no-return-await': 'error',
    'no-sequences': 'error',
    'no-shadow': 'off',
    'no-sparse-arrays': 'error',
    'no-template-curly-in-string': 'error',
    'no-throw-literal': 'error',
    'no-trailing-spaces': 'off',
    'no-undef-init': 'error',
    'no-underscore-dangle': 'error',
    'no-unsafe-finally': 'error',
    'no-unused-labels': 'error',
    'no-unused-vars': 'off',
    'object-shorthand': 'error',
    'one-var': ['error', 'never'],
    'prefer-object-spread': 'error',
    'prefer-rest-params': 'off',
    'prefer-template': 'error',
    'quote-props': 'off',
    radix: 'error',
    'require-await': 'off',
    'space-before-function-paren': 'off',
    'space-in-parens': ['off', 'never'],
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
    'unicorn/filename-case': ['error', { case: 'camelCase' }],
    'use-isnan': 'error',
    'valid-typeof': 'off',
  },
  overrides: [
    {
      files: ['scripts/*.js'],
      rules: {
        'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      },
    },
    {
      files: ['**/*.js'],
      rules: {
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/restrict-plus-operands': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
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
      files: ['packages/{rum,logs,rum-recorder}/src/index.ts', 'packages/rum-recorder/src/internal.ts'],
      rules: {
        'local-rules/disallow-enum-exports': 'error',
      },
    },
  ],
}
