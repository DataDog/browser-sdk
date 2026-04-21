import { display } from '@datadog/browser-core'
import { clearActiveEntries } from './activeEntries'
import { compile } from './expression'
import { compileCondition } from './condition'
import type { CompiledCondition } from './condition'
import { templateRequiresEvaluation, compileSegments } from './template'
import type { TemplateSegment, CompiledTemplate } from './template'
import type { CaptureOptions } from './capture'

// Sampling rate limits
const DEFAULT_MAX_SNAPSHOTS_PER_SECOND_GLOBALLY = 25
const DEFAULT_MAX_SNAPSHOTS_PER_SECOND_PER_PROBE = 1
const DEFAULT_MAX_NON_SNAPSHOTS_PER_SECOND_PER_PROBE = 5000
const DEFAULT_MAX_SNAPSHOTS_PER_PROBE_LIFETIME = 1000
const DEFAULT_MAX_NON_SNAPSHOTS_PER_PROBE_LIFETIME = 50000

// Global snapshot rate limiting
let globalSnapshotSamplingRateWindowStart = 0
let snapshotsSampledWithinTheLastSecond = 0

export interface ProbeWhere {
  typeName?: string
  methodName?: string
  sourceFile?: string
  lines?: string[]
}

export interface ProbeWhen {
  dsl: string
  json: any
}

export interface ProbeSampling {
  snapshotsPerSecond?: number
}

export interface ProbeBudgetConfiguration {
  maxSnapshotsPerSecondGlobally?: number
  maxSnapshotsPerSecondPerProbe?: number
  maxNonSnapshotsPerSecondPerProbe?: number
  maxSnapshotsPerProbeLifetime?: number
  maxNonSnapshotsPerProbeLifetime?: number
}

export interface Probe {
  id: string
  version: number
  type: string
  where: ProbeWhere
  when?: ProbeWhen
  template: string | CompiledTemplate
  segments?: TemplateSegment[]
  captureSnapshot: boolean
  capture: CaptureOptions
  sampling: ProbeSampling
  evaluateAt: 'ENTRY' | 'EXIT'
  location?: {
    file?: string
    lines?: string[]
    method?: string
  }
}

export interface InitializedProbe extends Probe {
  templateRequiresEvaluation: boolean
  functionId: string
  condition?: CompiledCondition
  msBetweenSampling: number
  lastCaptureMs: number
  eventsSentInLifetime: number
  lifetimeBudgetWarningEmitted: boolean
}

// Pre-populate with a placeholder key to help V8 optimize property lookups.
// Removing this shows a much larger performance overhead.
// Benchmarks show that using an object is much faster than a Map.
const activeProbes: Record<string, InitializedProbe[]> = {
  // @ts-expect-error - Pre-populate with a placeholder key to help V8 optimize property lookups.
  __placeholder__: undefined,
}
const probeIdToFunctionId: Record<string, string> = {
  // @ts-expect-error - Pre-populate with a placeholder key to help V8 optimize property lookups.
  __placeholder__: undefined,
}
let currentProbeBudgetConfiguration: Required<ProbeBudgetConfiguration> = {
  maxSnapshotsPerSecondGlobally: DEFAULT_MAX_SNAPSHOTS_PER_SECOND_GLOBALLY,
  maxSnapshotsPerSecondPerProbe: DEFAULT_MAX_SNAPSHOTS_PER_SECOND_PER_PROBE,
  maxNonSnapshotsPerSecondPerProbe: DEFAULT_MAX_NON_SNAPSHOTS_PER_SECOND_PER_PROBE,
  maxSnapshotsPerProbeLifetime: DEFAULT_MAX_SNAPSHOTS_PER_PROBE_LIFETIME,
  maxNonSnapshotsPerProbeLifetime: DEFAULT_MAX_NON_SNAPSHOTS_PER_PROBE_LIFETIME,
}

export function setProbeBudgetConfiguration(configuration: ProbeBudgetConfiguration = {}): void {
  currentProbeBudgetConfiguration = {
    maxSnapshotsPerSecondGlobally: normalizeProbeBudgetRate(
      configuration.maxSnapshotsPerSecondGlobally,
      DEFAULT_MAX_SNAPSHOTS_PER_SECOND_GLOBALLY
    ),
    maxSnapshotsPerSecondPerProbe: normalizeProbeBudgetRate(
      configuration.maxSnapshotsPerSecondPerProbe,
      DEFAULT_MAX_SNAPSHOTS_PER_SECOND_PER_PROBE
    ),
    maxNonSnapshotsPerSecondPerProbe: normalizeProbeBudgetRate(
      configuration.maxNonSnapshotsPerSecondPerProbe,
      DEFAULT_MAX_NON_SNAPSHOTS_PER_SECOND_PER_PROBE
    ),
    maxSnapshotsPerProbeLifetime: normalizeProbeLifetimeLimit(
      configuration.maxSnapshotsPerProbeLifetime,
      DEFAULT_MAX_SNAPSHOTS_PER_PROBE_LIFETIME
    ),
    maxNonSnapshotsPerProbeLifetime: normalizeProbeLifetimeLimit(
      configuration.maxNonSnapshotsPerProbeLifetime,
      DEFAULT_MAX_NON_SNAPSHOTS_PER_PROBE_LIFETIME
    ),
  }
}

export function resetProbeBudgetConfiguration(): void {
  setProbeBudgetConfiguration()
}

/**
 * Add a probe to the registry
 *
 * @param probe - The probe configuration
 */
export function addProbe(probe: Probe): void {
  initializeProbe(probe)
  let probes = activeProbes[probe.functionId]
  if (!probes) {
    probes = []
    activeProbes[probe.functionId] = probes
  }
  probes.push(probe)
  probeIdToFunctionId[probe.id] = probe.functionId
}

/**
 * Get initialized probes by function ID
 *
 * @param functionId - The probe function ID
 * @returns The initialized probes
 */
export function getProbes(functionId: string): InitializedProbe[] | undefined {
  return activeProbes[functionId]
}

/**
 * Get all active probes across all functions
 *
 * @returns Array of all active probes
 */
export function getAllProbes(): InitializedProbe[] {
  const allProbes: InitializedProbe[] = []
  for (const probes of Object.values(activeProbes)) {
    if (probes) {
      allProbes.push(...probes)
    }
  }
  return allProbes
}

/**
 * Remove a probe from the registry
 *
 * @param id - The probe ID
 */
export function removeProbe(id: string): void {
  const functionId = probeIdToFunctionId[id]
  if (!functionId) {
    throw new Error(`Probe with id ${id} not found`)
  }
  const probes = activeProbes[functionId]
  if (!probes) {
    throw new Error(`Probes with function id ${functionId} not found`)
  }
  for (let i = 0; i < probes.length; i++) {
    const probe = probes[i]
    if (probe.id === id) {
      if (typeof probe.template === 'object' && probe.template !== null && probe.template.clearCache) {
        probe.template.clearCache()
      }
      if (typeof probe.condition === 'object' && probe.condition !== null && probe.condition.clearCache) {
        probe.condition.clearCache()
      }
      probes.splice(i, 1)
      // TODO: Gracefully drain in-flight entries instead of clearing them immediately.
      // Deleting a probe can currently race with return/throw handling, whether removal
      // comes from delivery updates or budget-based auto-unregistering.
      clearActiveEntries(id)
      break
    }
  }
  delete probeIdToFunctionId[id]
  if (probes.length === 0) {
    delete activeProbes[functionId]
  }
}

/**
 * Clear all probes (useful for testing)
 */
export function clearProbes(): void {
  for (const probes of Object.values(activeProbes)) {
    if (probes) {
      for (const probe of probes) {
        if (typeof probe.template === 'object' && probe.template !== null && probe.template.clearCache) {
          probe.template.clearCache()
        }
        if (typeof probe.condition === 'object' && probe.condition !== null && probe.condition.clearCache) {
          probe.condition.clearCache()
        }
      }
    }
  }
  for (const functionId of Object.keys(activeProbes)) {
    if (functionId !== '__placeholder__') {
      delete activeProbes[functionId]
    }
  }
  for (const probeId of Object.keys(probeIdToFunctionId)) {
    if (probeId !== '__placeholder__') {
      delete probeIdToFunctionId[probeId]
    }
  }
  clearActiveEntries()
  globalSnapshotSamplingRateWindowStart = 0
  snapshotsSampledWithinTheLastSecond = 0
}

/**
 * Check global snapshot sampling budget
 *
 * @param now - Current timestamp in milliseconds
 * @param captureSnapshot - Whether this probe captures snapshots
 * @returns True if within budget, false if rate limited
 */
export function checkGlobalSnapshotBudget(now: number, captureSnapshot: boolean): boolean {
  // Only enforce global budget for probes that capture snapshots
  if (!captureSnapshot) {
    return true
  }

  // Reset counter if a second has passed
  // This algorithm is not a perfect sliding window, but it's quick and easy
  if (now - globalSnapshotSamplingRateWindowStart > 1000) {
    snapshotsSampledWithinTheLastSecond = 1
    globalSnapshotSamplingRateWindowStart = now
    return true
  }

  // Check if we've exceeded the global limit
  if (snapshotsSampledWithinTheLastSecond >= currentProbeBudgetConfiguration.maxSnapshotsPerSecondGlobally) {
    return false
  }

  // Increment counter and allow
  snapshotsSampledWithinTheLastSecond++
  return true
}

export function hasProbeLifetimeBudgetRemaining(probe: InitializedProbe): boolean {
  if (isProbeLifetimeBudgetExhausted(probe)) {
    if (!probe.lifetimeBudgetWarningEmitted) {
      probe.lifetimeBudgetWarningEmitted = true
      display.warn(
        `Debugger: Probe ${probe.id} version ${probe.version} reached max ${
          probe.captureSnapshot ? 'snapshot' : 'non-snapshot'
        } events per lifetime: ${getMaxProbeLifetimeEvents(probe)}`
      )
    }
    return false
  }

  return true
}

export function isProbeLifetimeBudgetExhausted(probe: InitializedProbe): boolean {
  return probe.eventsSentInLifetime >= getMaxProbeLifetimeEvents(probe)
}

/**
 * Initialize a probe by preprocessing template segments, conditions, and sampling
 *
 * @param probe - The probe configuration
 */
export function initializeProbe(probe: Probe): asserts probe is InitializedProbe {
  // TODO: Add support for anonymous functions (Currently only uniquely named functions are supported)
  ;(probe as InitializedProbe).functionId = `${probe.where.typeName};${probe.where.methodName}`

  // Compile condition if present
  try {
    if (probe.when?.json) {
      ;(probe as InitializedProbe).condition = compileCondition(String(compile(probe.when.json)))
    }
  } catch (err) {
    // TODO: Handle error properly
    display.error(
      `Cannot compile condition expression: ${probe.when!.dsl} (probe: ${probe.id}, version: ${probe.version})`,
      err as Error
    )
  }

  // Optimize for fast calculations when probe is hit
  ;(probe as InitializedProbe).templateRequiresEvaluation = templateRequiresEvaluation(probe.segments)
  if ((probe as InitializedProbe).templateRequiresEvaluation) {
    const segmentsCode = compileSegments(probe.segments!)

    // Pre-build the function body so we avoid rebuilding this string on every probe hit.
    // The actual Function is created at runtime because the parameter names (context keys)
    // aren't known until call time. For ENTRY probes there is exactly one set of keys; for
    // EXIT probes there can be two (normal-return vs exception path).
    const fnBodyTemplate = `return ${segmentsCode};`

    // Cache compiled functions by context keys to avoid recreating them
    const functionCache = new Map<string, (...args: any[]) => any[]>()

    // Store the template with a factory that caches functions
    probe.template = {
      createFunction: (contextKeys: string[]) => {
        const cacheKey = contextKeys.join(',')
        let fn = functionCache.get(cacheKey)
        if (!fn) {
          // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
          fn = new Function('$dd_inspect', ...contextKeys, fnBodyTemplate) as (...args: any[]) => any[]
          functionCache.set(cacheKey, fn)
        }
        return fn
      },
      clearCache: () => {
        functionCache.clear()
      },
    }
  }
  delete probe.segments

  // Optimize for fast calculations when probe is hit - calculate sampling budget
  const snapshotsPerSecond =
    probe.sampling?.snapshotsPerSecond ??
    (probe.captureSnapshot
      ? currentProbeBudgetConfiguration.maxSnapshotsPerSecondPerProbe
      : currentProbeBudgetConfiguration.maxNonSnapshotsPerSecondPerProbe)
  ;(probe as InitializedProbe).msBetweenSampling = (1 / snapshotsPerSecond) * 1000 // Convert to milliseconds
  ;(probe as InitializedProbe).lastCaptureMs = -Infinity // Initialize to -Infinity to allow first call
  ;(probe as InitializedProbe).eventsSentInLifetime = 0
  ;(probe as InitializedProbe).lifetimeBudgetWarningEmitted = false
}

function normalizeProbeLifetimeLimit(limit: number | undefined, defaultLimit: number): number {
  return typeof limit === 'number' && Number.isFinite(limit) && limit >= 0 ? limit : defaultLimit
}

function normalizeProbeBudgetRate(rate: number | undefined, defaultRate: number): number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : defaultRate
}

function getMaxProbeLifetimeEvents(probe: InitializedProbe): number {
  return probe.captureSnapshot
    ? currentProbeBudgetConfiguration.maxSnapshotsPerProbeLifetime
    : currentProbeBudgetConfiguration.maxNonSnapshotsPerProbeLifetime
}
