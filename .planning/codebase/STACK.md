# Technology Stack

**Analysis Date:** 2026-01-21

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code across packages
- JavaScript - Build scripts and configuration files

**Secondary:**
- JSX/TSX - React components in developer extension and React integration package

## Runtime

**Environment:**
- Node.js 25.3.0 (managed via Volta)
- Browser environments (ES2018+ target)
- Web Workers (for deflate compression)

**Package Manager:**
- Yarn 4.12.0 (Berry)
- Lockfile: `yarn.lock` present
- Workspace-based monorepo structure

## Frameworks

**Core:**
- Custom browser SDK (no external framework dependencies for SDK packages)
- React 19.2.3 - Used in developer extension and React integration package
- React Router 6.x/7.x - Peer dependency for `@datadog/browser-rum-react`

**Testing:**
- Karma 6.4.4 - Unit test runner
- Jasmine 3.99.1 - Test framework and assertions
- Playwright 1.57.0 - E2E testing
- BrowserStack - Cross-browser testing

**Build/Dev:**
- Webpack 5.104.1 - Bundling
- TypeScript Compiler 5.9.3 - Module builds (ESM/CJS)
- ts-loader 9.5.4 - Webpack TypeScript integration
- swc-loader 0.2.6 - Fast TypeScript/JavaScript compilation
- TerserPlugin 5.3.16 - Minification
- WXT 0.20.13 - Browser extension development (developer-extension)

## Key Dependencies

**Critical:**
- pako 2.1.0 - Deflate compression for payload optimization
- No external runtime dependencies (SDK packages are self-contained)

**Infrastructure:**
- undici 7.18.2 - HTTP client for Node.js scripts
- express 5.2.1 - Dev server
- lerna 9.0.3 - Monorepo management
- typedoc 0.28.16 - API documentation generation

**Development:**
- eslint 9.39.2 - Linting with typescript-eslint 8.52.0
- prettier 3.7.4 - Code formatting
- karma-coverage-istanbul-reporter 3.0.3 - Code coverage
- puppeteer 24.34.0 - Browser automation for tests

## Configuration

**Environment:**
- No `.env` files detected (configuration passed via initialization)
- Build environment variables injected via `__BUILD_ENV__SDK_VERSION__` at build time
- SDK configuration via runtime initialization (clientToken, applicationId, site, etc.)

**Build:**
- `tsconfig.base.json` - Base TypeScript configuration
- `tsconfig.webpack.json` - Webpack-specific TypeScript config
- `tsconfig.default.json` - Default for uncategorized files
- `tsconfig.scripts.json` - Build scripts configuration
- `webpack.base.ts` - Shared Webpack configuration
- `.prettierrc.yml` - Code formatting rules
- `eslint.config.mjs` - ESLint 9 flat config

**TypeScript:**
- Target: ES2018
- Module: ES2020
- Strict mode enabled
- Path aliases for internal packages (`@datadog/browser-*`)
- Multiple build outputs: ESM (`esm/`), CJS (`cjs/`), and bundled (`bundle/`)

## Platform Requirements

**Development:**
- Node.js 25.3.0+
- Yarn 4.12.0
- Chrome for unit tests (Karma with ChromeHeadless)
- Chromium for E2E tests (Playwright)

**Production:**
- Browser: ES2018+ support required
- Target platforms: Web browsers (Chrome, Firefox, Safari, Edge)
- Web Workers support for compression features
- Cookie support for session management

**CI/CD:**
- GitLab CI (`.gitlab-ci.yml`) - Primary CI pipeline
- GitHub Actions (`.github/workflows/`) - Auxiliary workflows
- BrowserStack integration for cross-browser testing
- Docker-based CI image: `registry.ddbuild.io/ci/browser-sdk`

---

*Stack analysis: 2026-01-21*
