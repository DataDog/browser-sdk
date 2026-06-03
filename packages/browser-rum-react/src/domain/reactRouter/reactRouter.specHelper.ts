import { ignoreConsoleLogs } from '../../../../core/test'

export function ignoreReactRouterDeprecationWarnings() {
  ignoreConsoleLogs('warn', 'React Router Future Flag Warning')
}
