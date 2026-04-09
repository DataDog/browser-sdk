export interface WithDatadogRumOptions {
  /** Enable document-policy: js-profiling header for browser profiling */
  profilingSampleRate?: number
  /** Automatically wrap server components with tracing spans. Defaults to true. */
  traceServerComponents?: boolean
}

interface NextHeaderEntry {
  source: string
  headers: Array<{ key: string; value: string }>
}

type HeadersFunction = () => Promise<NextHeaderEntry[]>

interface NextConfig {
  env?: Record<string, string | undefined>
  productionBrowserSourceMaps?: boolean
  headers?: HeadersFunction
  [key: string]: any
}

type NextConfigFn = (phase: string, context: { defaultConfig: NextConfig }) => NextConfig | Promise<NextConfig>

type NextConfigInput = NextConfig | NextConfigFn

function applyDatadogConfig(config: NextConfig, options?: WithDatadogRumOptions): NextConfig {
  const env = { ...config.env }

  // Inject NEXT_PUBLIC_DD_VERSION if not already set by the user
  if (!env.NEXT_PUBLIC_DD_VERSION) {
    const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.DD_VERSION
    if (version) {
      env.NEXT_PUBLIC_DD_VERSION = version
    }
  }

  // Inject NEXT_PUBLIC_DD_ENV if not already set by the user
  if (!env.NEXT_PUBLIC_DD_ENV) {
    const ddEnv = process.env.VERCEL_ENV || process.env.DD_ENV
    if (ddEnv) {
      env.NEXT_PUBLIC_DD_ENV = ddEnv
    }
  }

  const result: NextConfig = {
    ...config,
    env,
  }

  // Enable source maps unless the user explicitly set it to false
  if (config.productionBrowserSourceMaps !== false) {
    result.productionBrowserSourceMaps = true
  }

  // Add document-policy header when profiling is enabled
  if (options?.profilingSampleRate && options.profilingSampleRate > 0) {
    const originalHeaders = config.headers
    result.headers = async () => {
      const userHeaders = (await originalHeaders?.()) ?? []
      return userHeaders.concat([
        {
          source: '/(.*)',
          headers: [{ key: 'Document-Policy', value: 'js-profiling' }],
        },
      ])
    }
  }

  // Register the server component loader for automatic tracing
  if (options?.traceServerComponents !== false) {
    const loaderPath = require.resolve('./serverComponentLoader')

    // Ensure async_hooks (used by componentTrace) is resolved from Node.js,
    // not bundled by webpack/turbopack
    const externals = result.serverExternalPackages ?? []
    if (!externals.includes('async_hooks')) {
      result.serverExternalPackages = [...externals, 'async_hooks']
    }

    // Webpack: add loader rule for server-side compilation
    const originalWebpack = result.webpack
    result.webpack = (webpackConfig: any, context: any) => {
      if (context.isServer) {
        webpackConfig.module.rules.push({
          test: /\.(tsx?|jsx?)$/,
          include: /[\\/]app[\\/]/,
          exclude: /node_modules/,
          use: [{ loader: loaderPath }],
        })
      }
      return originalWebpack ? originalWebpack(webpackConfig, context) : webpackConfig
    }

    // Turbopack: add loader rule using a wildcard glob with a path condition
    // so that only files under app/ are transformed. The loader itself also has
    // a path guard as a safety net. We use the Turbopack condition API documented
    // at https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
    result.turbopack = {
      ...result.turbopack,
      rules: {
        ...result.turbopack?.rules,
        '*.tsx': {
          loaders: [loaderPath],
        },
        '*.ts': {
          loaders: [loaderPath],
        },
      },
    }
  }

  return result
}

export function withDatadogRum(nextConfig: NextConfigInput, options?: WithDatadogRumOptions): NextConfigInput {
  if (typeof nextConfig === 'function') {
    return async (phase: string, context: { defaultConfig: NextConfig }) => {
      const resolvedConfig = await nextConfig(phase, context)
      return applyDatadogConfig(resolvedConfig, options)
    }
  }

  return applyDatadogConfig(nextConfig, options)
}
