import { makeExposurePublicApi } from './boot/exposurePublicApi'
import type { ExposureInitConfiguration } from './domain/configuration'
import type { ExposureEvent } from './exposureEvent.types'
import type { TrackExposureOptions } from './domain/exposureCollection'

// Create the global DD_EXPOSURE object
const DD_EXPOSURE = makeExposurePublicApi()

// Export types for TypeScript users
export type { ExposureInitConfiguration, ExposureEvent, TrackExposureOptions }

// Export the global object
export { DD_EXPOSURE }

// Export the public API maker for advanced use cases
export { makeExposurePublicApi } 