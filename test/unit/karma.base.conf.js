import { parseArgs } from 'node:util'
import webpackBase from '../../webpack.base.ts'

import { getTestReportDirectory } from '../envUtils.ts'
import jasmineSeedReporterPlugin from './jasmineSeedReporterPlugin.js'
import karmaSkippedFailedReporterPlugin from './karmaSkippedFailedReporterPlugin.js'
import karmaDuplicateTestNameReporterPlugin from './karmaDuplicateTestNameReporterPlugin.js'

const webpackConfig = webpackBase({
  mode: 'development',
  types: ['jasmine', 'chrome'],
  // do not replace some build env variables in unit test in order to test different build behaviors
  keepBuildEnvVariables: ['SDK_VERSION'],
})

const reporters = ['spec', 'jasmine-seed', 'karma-skipped-failed', 'karma-duplicate-test-name']

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push('junit')
}

const FILES = [
  // Make sure 'forEach.spec' is the first file to be loaded, so its `beforeEach` hook is executed
  // before all other `beforeEach` hooks, and its `afterEach` hook is executed after all other
  // `afterEach` hooks.
  'packages/core/test/forEach.spec.ts',
  'packages/rum/test/toto.css',
]

const FILES_SPECS = [
  'packages/*/@(src|test)/**/*.spec.@(ts|tsx)',
  'developer-extension/@(src|test)/**/*.spec.@(ts|tsx)',
]

// eslint-disable-next-line import/no-default-export
export default {
  basePath: '../..',
  files: getFiles(),
  frameworks: ['jasmine', 'webpack'],
  client: {
    jasmine: {
      random: true,
      stopSpecOnExpectationFailure: true,
    },
  },
  preprocessors: {
    '**/*.+(ts|tsx)': ['webpack', 'sourcemap'],
    // Apply sourcemaps to webpack common chunk
    '/**/*.js': ['sourcemap'],
  },
  reporters,
  specReporter: {
    suppressErrorSummary: true,
    suppressPassed: true,
    suppressSkipped: true,
    showBrowser: true,
  },
  junitReporter: {
    outputDir: testReportDirectory,
  },
  singleRun: true,
  webpack: {
    stats: 'minimal',
    module: overrideTsLoaderRule(webpackConfig.module),
    resolve: webpackConfig.resolve,
    target: webpackConfig.target,
    devtool: false,
    mode: 'development',
    plugins: webpackConfig.plugins,
    optimization: {
      // By default, karma-webpack creates a bundle with one entry point for each spec file, but
      // with all dependencies shared.  Our test suite does not support sharing dependencies, each
      // spec bundle should include its own copy of dependencies.
      runtimeChunk: false,
    },
    ignoreWarnings: [
      // we will see warnings about missing exports in some files
      // this is because we set transpileOnly option in ts-loader
      { message: /export .* was not found in/ },
    ],
  },
  webpackMiddleware: {
    stats: 'errors-only',
    logLevel: 'warn',
  },
  plugins: [
    'karma-*',
    jasmineSeedReporterPlugin,
    karmaSkippedFailedReporterPlugin,
    karmaDuplicateTestNameReporterPlugin,
  ],

  // Running tests on low performance environments (ex: BrowserStack) can block JS execution for a
  // few seconds. We need to increase those two timeout values to make sure Karma (and underlying
  // Socket.io) does not consider that the browser crashed.
  pingTimeout: 60_000,
  browserNoActivityTimeout: 60_000,
}

function overrideTsLoaderRule(module) {
  // We set transpileOnly to true to avoid type checking in unit tests
  module.rules = module.rules.map((rule) => {
    if (rule.loader === 'ts-loader') {
      return {
        ...rule,
        options: {
          ...rule.options,
          transpileOnly: true,
        },
      }
    }
    return rule
  })

  // TODO next major see if we can remove this transpilation when bumping browsers
  // We use swc-loader to transpile some dependencies that are using syntax not compatible with browsers we use for testing
  module.rules.push({
    test: /\.m?js$/,
    include: /node_modules\/(react|react-router-dom|react-dom|react-router|turbo-stream)/,
    use: {
      loader: 'swc-loader',
      options: {
        env: {
          targets: {
            chrome: '63',
          },
        },
      },
    },
  })

  return module
}

function getFiles() {
  const { values } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      spec: {
        type: 'string',
        multiple: true,
      },
    },
  })

  if (values.spec) {
    return FILES.concat(values.spec)
  }

  return FILES.concat(FILES_SPECS)
}
