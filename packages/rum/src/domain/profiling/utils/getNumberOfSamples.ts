import type { ProfilerSample } from '../types'

/**
 * Counts number of samples when the thread was not idle (stackId is defined)
 * @param samples Array of collected samples
 * @returns Number of samples
 */
export function getNumberOfSamples(samples: ProfilerSample[]): number {
  let numberOfSamples = 0
  for (const sample of samples) {
    if (sample.stackId !== undefined) {
      numberOfSamples++
    }
  }
  return numberOfSamples
}
