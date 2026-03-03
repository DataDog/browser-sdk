import { CONTEXT_RESOLUTION_HELPERS } from '@datadog/browser-sdk-endpoint'
import { DEFAULT_RUM_CONFIGURATION, html, basePage, createCrossOriginScriptUrls } from '../framework'
import type { SetupOptions, Servers } from '../framework'

export interface ContextItem {
  key: string
  value: {
    rcSerializedType: string
    value?: string
    strategy?: string
    name?: string
    path?: string
    selector?: string
    attribute?: string
    extractor?: unknown
  }
}

/**
 * Creates a SetupFactory that generates an HTML page mimicking the embedded config bundle
 * produced by generateCombinedBundle(), with context resolution for user and globalContext.
 * Uses CONTEXT_RESOLUTION_HELPERS verbatim so tests exercise the same code as production.
 *
 * @param extraConfig - optional user[] / context[] arrays and optional pre-SDK script
 * @param extraConfig.user - optional user context items
 * @param extraConfig.context - optional global context items
 * @param extraConfig.preSDKScript - extra inline JS injected before the SDK script tag (e.g. to pre-set a cookie)
 */
export function createEmbeddedConfigSetup(extraConfig: {
  user?: ContextItem[]
  context?: ContextItem[]
  /** Extra inline JS injected before the SDK script tag (e.g. to pre-set a cookie). */
  preSDKScript?: string
}) {
  return (options: SetupOptions, servers: Servers): string => {
    const { rumScriptUrl } = createCrossOriginScriptUrls(servers, options)

    const embeddedConfig = {
      ...DEFAULT_RUM_CONFIGURATION,
      sessionSampleRate: 100,
      proxy: servers.intake.origin,
      ...extraConfig,
    }
    const configJson = JSON.stringify(embeddedConfig)
    const testContextJson = JSON.stringify(options.context)

    const header = html`
      ${extraConfig.preSDKScript ? `<script type="text/javascript">${extraConfig.preSDKScript}</script>` : ''}
      <script type="text/javascript" src="${rumScriptUrl}"></script>
      <script type="text/javascript">
        (function () {
          'use strict';
          var __DATADOG_REMOTE_CONFIG__ = ${configJson};
          var __dd_user = {};
          (__DATADOG_REMOTE_CONFIG__.user || []).forEach(function (item) {
            __dd_user[item.key] = __dd_resolveContextValue(item.value);
          });
          var __dd_globalContext = {};
          (__DATADOG_REMOTE_CONFIG__.context || []).forEach(function (item) {
            __dd_globalContext[item.key] = __dd_resolveContextValue(item.value);
          });
          var hasUser = Object.keys(__dd_user).length > 0;
          var hasGlobalContext = Object.keys(__dd_globalContext).length > 0;
          window.DD_RUM.init(Object.assign({}, __DATADOG_REMOTE_CONFIG__, {
            user: hasUser ? __dd_user : undefined,
            context: undefined,
            globalContext: hasGlobalContext ? __dd_globalContext : undefined
          }));
          // Re-apply test isolation context after init so it is not overwritten by the
          // globalContext init option (setContext replaces; we add test properties back).
          var __dd_testContext = ${testContextJson};
          Object.keys(__dd_testContext).forEach(function(key) {
            window.DD_RUM.setGlobalContextProperty(key, __dd_testContext[key]);
          });

          ${CONTEXT_RESOLUTION_HELPERS.trim()}
        })();
      </script>
    `
    return basePage({ header })
  }
}
