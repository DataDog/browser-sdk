import { createSanitize } from '@datadog/js-core/util'
import { display } from '../display'

// eslint-disable-next-line local-rules/disallow-side-effects
export const sanitize = createSanitize(display)
