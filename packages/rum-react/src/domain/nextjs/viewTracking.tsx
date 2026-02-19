import { display } from '@datadog/browser-core'
import { onRumInit } from '../reactPlugin'

/**
 * Computes a view name by replacing dynamic parameter values in the pathname
 * with their corresponding parameter names from Next.js's useParams().
 *
 * @example
 * computeViewName('/user/42', { id: '42' }) // => '/user/:id'
 * computeViewName('/docs/a/b/c', { slug: ['a', 'b', 'c'] }) // => '/docs/:slug'
 */
export function computeViewName(pathname: string, params: Record<string, string | string[] | undefined>): string {
  let viewName = pathname
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue
    }
    if (Array.isArray(value)) {
      viewName = viewName.replace(value.join('/'), `:${key}`)
    } else {
      viewName = viewName.replace(value, `:${key}`)
    }
  }
  return viewName
}

/**
 * Starts a new RUM view with the given view name.
 *
 * @internal
 */
export function startNextjsView(viewName: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.nextjs) {
      display.warn('`nextjs: true` is missing from the react plugin configuration, the view will not be tracked.')
      return
    }

    rumPublicApi.startView(viewName)
  })
}
