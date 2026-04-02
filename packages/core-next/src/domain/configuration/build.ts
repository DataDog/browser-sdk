import { DEFAULTS } from './defaults'
import { validate } from './validation'
import type { Configuration, Extension, InitConfiguration } from '.'

function build(
  init: InitConfiguration,
  extensions: Extension<string, unknown, unknown, unknown>[]
): (Configuration & Record<string, unknown>) | null {
  if (!validate(init)) {
    return null
  }

  const base: Configuration = {
    ...DEFAULTS,
    ...init,
  }

  const result = base as Configuration & Record<string, unknown>

  for (const extension of extensions) {
    const initSlice = (init as unknown as Record<string, unknown>)[extension.key]
    if (initSlice === undefined) {
      continue
    }
    const configSlice = extension.validate(initSlice)
    if (configSlice === null) {
      return null
    }
    if (extension.build) {
      result[extension.key] = {
        ...(configSlice as Record<string, unknown>),
        ...(extension.build(configSlice) as Record<string, unknown>),
      }
    } else {
      result[extension.key] = configSlice
    }
  }

  return result
}

export { build }
