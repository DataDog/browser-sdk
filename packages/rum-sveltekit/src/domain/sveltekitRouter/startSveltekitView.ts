import { display } from '@datadog/browser-core'
import { onRumInit } from '../sveltekitPlugin'

export function startSveltekitRouterView(routeId: string | null) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn(
        '`router: true` is missing from the sveltekit plugin configuration, the view will not be tracked.'
      )
      return
    }
    rumPublicApi.startView(computeViewName(routeId))
  })
}

/**
 * Compute the RUM view name from a SvelteKit route ID.
 *
 * SvelteKit's route.id is already the parameterized pattern (e.g. '/blog/[slug]',
 * '/[[lang]]/home', '/[...rest]'). Route groups such as (app) are stripped by SvelteKit
 * before route.id is set. The only post-processing needed is stripping parameter matchers
 * from segments like '[page=fruit]' → '[page]'.
 */
export function computeViewName(routeId: string | null): string {
  if (!routeId) {
    return ''
  }
  // Strip parameter matchers: [name=matcher] → [name]
  // Matches a single bracket segment containing an identifier, '=', and matcher text.
  // Does not affect optional segments [[...]] or rest segments [...rest].
  return routeId.replace(/\[([a-z_][a-z0-9_]*)=[^\]]*\]/gi, '[$1]')
}
