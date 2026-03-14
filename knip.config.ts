import type { KnipConfig } from 'knip'

const JS_EXT = '.{ts,mjs,js,tsx}'
const ALL_JS = `**/*${JS_EXT}`

const config: KnipConfig = {
  // ambient declaration file included via tsconfig, not via imports
  ignoreFiles: ['test/e2e/lib/types/global.ts'],

  workspaces: {
    '.': {
      entry: [
        `scripts/${ALL_JS}`,
        'webpack.base.ts',
        `*.config${JS_EXT}`,
        'test/unit/karma.*.conf.js',
        `sandbox/${ALL_JS}`,
      ],
      project: [
        `scripts/${ALL_JS}`,
        `*${JS_EXT}`,
        `test/unit/${ALL_JS}`,
        `eslint-local-rules/${ALL_JS}`,
        `sandbox/${ALL_JS}`,
      ],
      ignoreBinaries: ['scripts/cli'],
      ignoreDependencies: [
        // Karma plugins are referenced as strings in the karma config, not as ES imports
        'karma-jasmine',
        'karma-.*-launcher',
        'karma-.*-loader',
        'karma-.*-reporter',
        'karma-webpack',
        'jasmine-core',
        // Webpack loaders referenced by name in karma/webpack configs
        '.*-loader',
        // @swc/core is a peer dependency of swc-loader, not directly imported
        '@swc/core',
        // CLI tools invoked via execa/spawn or npm scripts, not imported
        'lerna',
        'http-server',
        // sandbox/react-app imports @datadog/* workspace siblings not declared as root deps
        '@datadog/.*',
      ],
    },

    // core and rum-core export from src/index.ts
    'packages/core': {
      entry: ['src/index.ts'],
      project: [
        ALL_JS,
        // auto-generated from rum-events-format schema; exports are owned by upstream
        '!src/domain/telemetry/telemetryEvent.types.ts',
      ],
      // cross-package imports in test files: rum depends on core, but core tests import rum for integration testing
      ignoreDependencies: ['@datadog/browser-rum', '@datadog/browser-rum-core'],
    },
    'packages/rum-core': {
      entry: ['src/index.ts'],
      project: [
        ALL_JS,
        // auto-generated from rum-events-format schema; exports are owned by upstream
        '!src/rumEvent.types.ts',
      ],
    },

    // other packages export from src/entries/*.ts
    'packages/rum': {
      entry: ['src/entries/*.ts'],
      project: [ALL_JS],
    },
    'packages/rum-slim': {
      entry: ['src/entries/main.ts'],
      project: [ALL_JS],
    },
    'packages/rum-react': {
      entry: ['src/entries/*.ts'],
      project: [ALL_JS],
      // react-router and react-router-dom are optional peer deps used only by /react-router-vX entry points
      ignoreDependencies: ['react-router', 'react-router-dom'],
    },
    'packages/rum-nextjs': {
      entry: ['src/entries/main.ts'],
      project: [ALL_JS],
    },
    'packages/logs': {
      entry: ['src/entries/main.ts'],
      project: [ALL_JS],
    },
    'packages/flagging': {
      entry: ['src/entries/main.ts'],
      project: [ALL_JS],
      // webpack is used by the external build script, not imported in source
      ignoreDependencies: ['webpack'],
    },
    'packages/worker': {
      entry: ['src/entries/main.ts'],
      project: [ALL_JS],
      // webpack is used by the external build script, not imported in source
      ignoreDependencies: ['webpack'],
    },

    // Chrome extension: HTML entrypoints load devtools/index.ts and panel/index.tsx
    'developer-extension': {
      entry: [
        'wxt.config.ts', // WXT build config
        `src/entrypoints/*${JS_EXT}`, // background.ts, contentScriptIsolated.ts, contentScriptMain.ts
        'src/devtools/index.ts', // loaded by devtools.html
        'src/panel/index.tsx', // loaded by panel.html
      ],
      project: [
        `src/${ALL_JS}`,
        // protocol types consumed by session replay player iframe (external); exports not tracked here
        '!src/panel/sessionReplayPlayer/sessionReplayPlayer.types.ts',
      ],
      // @wxt-dev/module-react is referenced as a string in wxt.config.ts modules array, not imported
      ignoreDependencies: ['@wxt-dev/module-react'],
    },

    'test/e2e': {
      entry: ['scenario/**/*.scenario.ts', 'playwright.*.config.ts'],
      project: [ALL_JS],
      // @datadog/* packages are workspace siblings resolved via yarn hoisting, not declared as deps
      ignoreDependencies: ['@datadog/.*'],
    },

    // test/apps/* sub-packages: each has its own package.json but relies on workspace hoisting
    'test/apps/base-extension': {
      ignoreDependencies: ['@datadog/.*'],
    },
    'test/apps/vanilla': {
      ignoreDependencies: ['@datadog/.*'],
    },
    'test/apps/microfrontend': {
      // webpack entry points (the webpack plugin is disabled so we declare them explicitly)
      entry: ['app1.ts', 'app2.ts', 'bootstrap.ts'],
      // app1/ and app2/ are module federation remotes resolved at runtime, not npm packages
      ignoreDependencies: ['app1', 'app2'],
      // disable webpack plugin: webpack.*.js configs require packages not installed locally
      webpack: false,
    },
    'test/apps/nextjs-app-router': {
      ignoreBinaries: ['next'],
      ignoreDependencies: ['@datadog/.*', 'react-dom', '@types/react-dom'],
    },
    'test/apps/react-heavy-spa': {},
    'test/apps/react-router-v6-app': {
      ignoreDependencies: ['@datadog/.*'],
    },
    'test/apps/react-shopist-like': {},

    // test/performance is a yarn workspace but has no package.json
    'test/performance': {
      entry: ['playwright.config.ts', `scenarios/${ALL_JS}`],
      project: [ALL_JS],
      ignoreDependencies: ['@datadog/.*'],
    },
  },
}

// eslint-disable-next-line import/no-default-export
export default config
