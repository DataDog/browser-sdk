import type { ErrorWithCause } from '@datadog/browser-core'
import { display } from './display'
import { compile } from './expression'
import { compileCondition } from './condition'
import type { CompiledCondition } from './condition'
import { browserInspect, templateRequiresEvaluation, compileSegments } from './template'
import type { TemplateSegment } from './template'
import { formatUnknownError } from './error'
import type { CaptureOptions } from './capture'
import type { ActiveEntry } from './activeEntries'
import type { ExpressionNode } from './expression'

// Sampling rate limits
const DEFAULT_MAX_SNAPSHOTS_PER_SECOND_GLOBALLY = 25
const DEFAULT_MAX_SNAPSHOTS_PER_SECOND_PER_PROBE = 1
const DEFAULT_MAX_NON_SNAPSHOTS_PER_SECOND_PER_PROBE = 5000
const DEFAULT_MAX_SNAPSHOTS_PER_PROBE_LIFETIME = 1000
const DEFAULT_MAX_NON_SNAPSHOTS_PER_PROBE_LIFETIME = 50000
const DEFAULT_MS_BETWEEN_CONDITION_ERRORS = 5 * 60 * 1000

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

export interface ProbeCaptureExpression {
  name: string
  expr: {
    dsl: string
    json: ExpressionNode
  }
  capture?: CaptureOptions
}

export interface CompiledCaptureExpression {
  name: string
  expression: string
  capture: CaptureOptions
}

export interface CompiledCaptureExpressions {
  expressions: CompiledCaptureExpression[]
  evaluateExpression: (expression: string, context: Record<string, any>) => unknown
}

export interface Probe {
  id: string
  version: number
  type: string
  where: ProbeWhere
  when?: ProbeWhen
  template: string
  segments?: TemplateSegment[]
  captureSnapshot: boolean
  capture: CaptureOptions
  captureExpressions?: ProbeCaptureExpression[]
  sampling?: ProbeSampling
  evaluateAt: 'ENTRY' | 'EXIT'
  location?: {
    file?: string
    lines?: string[]
    method?: string
  }
}

export interface InitializedProbe extends Probe {
  functionId: string
  condition?: CompiledCondition
  evaluateTemplate?: (context: Record<string, any>) => unknown[]
  compiledCaptureExpressions?: CompiledCaptureExpressions
  msBetweenSampling: number
  lastCaptureMs: number
  lastConditionErrorMs: number
  eventsSentInLifetime: number
  lifetimeBudgetWarningEmitted: boolean
  activeEntries: Array<ActiveEntry | null>
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
 * Remove a probe from the registry.
 *
 * Passing an initialized probe removes only that exact registered instance, so
 * stale in-flight returns cannot remove a newer replacement with the same id.
 */
export function removeProbe(id: string): void
export function removeProbe(probe: InitializedProbe): void
export function removeProbe(idOrProbe: string | InitializedProbe): void {
  const id = typeof idOrProbe === 'string' ? idOrProbe : idOrProbe.id
  const expectedProbe = typeof idOrProbe === 'string' ? undefined : idOrProbe
  const functionId = probeIdToFunctionId[id]
  if (!functionId) {
    if (expectedProbe) {
      // Identity-checked removal is best-effort: the in-flight probe instance
      // may already have been removed or replaced by the delivery API.
      return
    }
    throw new Error(`Probe with id ${id} not found`)
  }
  const probes = activeProbes[functionId]
  if (!probes) {
    if (expectedProbe) {
      // The id mapping can outlive the probe array briefly for stale in-flight
      // instances; there is nothing left for this instance to unregister.
      return
    }
    throw new Error(`Probes with function id ${functionId} not found`)
  }
  for (let i = 0; i < probes.length; i++) {
    const probe = probes[i]
    if (probe.id === id && (!expectedProbe || probe === expectedProbe)) {
      const remainingProbes = probes.slice(0, i).concat(probes.slice(i + 1))
      if (remainingProbes.length === 0) {
        delete activeProbes[functionId]
      } else {
        activeProbes[functionId] = remainingProbes
      }
      delete probeIdToFunctionId[id]
      return
    }
  }
  const hasReplacementWithSameId = expectedProbe && probes.some((probe) => probe.id === id)
  if (hasReplacementWithSameId) {
    // Stale in-flight instance: a replacement with the same id is already registered.
    return
  }

  // No matching registered probe exists, so the id mapping is orphaned.
  delete probeIdToFunctionId[id]
  if (activeProbes[functionId]?.length === 0) {
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
        // Unlike removeProbe(), clearProbes() is an aggressive teardown used by
        // tests and the delivery API circuit breaker. Drop in-flight entries so
        // stale captured probe instances cannot emit after the debugger is disabled.
        probe.activeEntries.length = 0
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
  // Only enforce global budget for probes that capture snapshots or capture expressions
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

function hasProbeLifetimeBudgetRemaining(probe: InitializedProbe): boolean {
  if (isProbeLifetimeBudgetExhausted(probe)) {
    if (!probe.lifetimeBudgetWarningEmitted) {
      probe.lifetimeBudgetWarningEmitted = true
      display.warn(
        `Probe ${probe.id} version ${probe.version} reached max ${
          isSnapshotProducingProbe(probe) ? 'snapshot' : 'non-snapshot'
        } events per lifetime: ${getMaxProbeLifetimeEvents(probe)}`
      )
    }
    return false
  }

  return true
}

export function enforceProbeLifetimeBudget(probe: InitializedProbe): boolean {
  if (!hasProbeLifetimeBudgetRemaining(probe)) {
    removeProbe(probe)
    return false
  }

  return true
}

export function recordProbeEventSent(probe: InitializedProbe): void {
  probe.eventsSentInLifetime++
  if (isProbeLifetimeBudgetExhausted(probe)) {
    removeProbe(probe)
  }
}

export function isProbeLifetimeBudgetExhausted(probe: InitializedProbe): boolean {
  return probe.eventsSentInLifetime >= getMaxProbeLifetimeEvents(probe)
}

export function checkConditionErrorBudget(probe: InitializedProbe, now: number): boolean {
  if (now - probe.lastConditionErrorMs < DEFAULT_MS_BETWEEN_CONDITION_ERRORS) {
    return false
  }

  probe.lastConditionErrorMs = now
  return true
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
    // TODO: Report to the debugger intake as a diagnostics message with state ERROR.
    const conditionError = new Error(
      `Cannot compile condition expression: ${probe.when!.dsl} (probe: ${probe.id}, version: ${probe.version})`
    )
    ;(conditionError as ErrorWithCause).cause = err
    throw conditionError
  }

  // Optimize for fast calculations when probe is hit
  if (templateRequiresEvaluation(probe.segments)) {
    const segmentsCode = compileSegments(probe.segments!)

    // Pre-build the function body so we avoid rebuilding this string on every probe hit.
    // The actual Function is created at runtime because the parameter names (context keys)
    // aren't known until call time. For ENTRY probes there is exactly one set of keys; for
    // EXIT probes there can be two (normal-return vs exception path).
    const fnBodyTemplate = `return ${segmentsCode};`

    const getFunction = createCachedFunctionFactory(
      (contextKeys: string[]) => contextKeys.join(','),
      (contextKeys: string[]) =>
        // TODO: Avoid helper parameter shadowing if contextKeys contain reserved
        // helper names like $dd_inspect or $dd_format_error.
        // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
        new Function('$dd_inspect', '$dd_format_error', ...contextKeys, fnBodyTemplate) as (...args: any[]) => unknown[]
    )

    ;(probe as InitializedProbe).evaluateTemplate = (context: Record<string, any>): unknown[] =>
      callWithContext(context, (thisValue, contextKeys, contextValues) =>
        getFunction(contextKeys).call(thisValue, browserInspect, formatUnknownError, ...contextValues)
      )
  }
  delete probe.segments

  if (!probe.captureSnapshot && probe.captureExpressions?.length) {
    ;(probe as InitializedProbe).compiledCaptureExpressions = compileCaptureExpressions(probe)
  }
  delete probe.captureExpressions

  // Optimize for fast calculations when probe is hit - calculate sampling budget
  const snapshotsPerSecond =
    probe.sampling?.snapshotsPerSecond ??
    (isSnapshotProducingProbe(probe)
      ? currentProbeBudgetConfiguration.maxSnapshotsPerSecondPerProbe
      : currentProbeBudgetConfiguration.maxNonSnapshotsPerSecondPerProbe)
  ;(probe as InitializedProbe).msBetweenSampling = (1 / snapshotsPerSecond) * 1000 // Convert to milliseconds
  ;(probe as InitializedProbe).lastCaptureMs = -Infinity // Initialize to -Infinity to allow first call
  ;(probe as InitializedProbe).lastConditionErrorMs = -Infinity
  ;(probe as InitializedProbe).eventsSentInLifetime = 0
  ;(probe as InitializedProbe).lifetimeBudgetWarningEmitted = false
  ;(probe as InitializedProbe).activeEntries = []
}

function normalizeProbeLifetimeLimit(limit: number | undefined, defaultLimit: number): number {
  return typeof limit === 'number' && Number.isFinite(limit) && limit >= 0 ? limit : defaultLimit
}

function normalizeProbeBudgetRate(rate: number | undefined, defaultRate: number): number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : defaultRate
}

function getMaxProbeLifetimeEvents(probe: InitializedProbe): number {
  return isSnapshotProducingProbe(probe)
    ? currentProbeBudgetConfiguration.maxSnapshotsPerProbeLifetime
    : currentProbeBudgetConfiguration.maxNonSnapshotsPerProbeLifetime
}

function isSnapshotProducingProbe(probe: Probe): boolean {
  return (
    probe.captureSnapshot ||
    (probe.captureExpressions?.length ??
      (probe as InitializedProbe).compiledCaptureExpressions?.expressions.length ??
      0) > 0
  )
}

function compileCaptureExpressions(probe: Probe): CompiledCaptureExpressions {
  const expressions: CompiledCaptureExpression[] = []
  for (const captureExpression of probe.captureExpressions!) {
    try {
      expressions.push({
        name: captureExpression.name,
        expression: String(compile(captureExpression.expr.json)),
        capture: {
          maxReferenceDepth: captureExpression.capture?.maxReferenceDepth ?? probe.capture?.maxReferenceDepth,
          maxCollectionSize: captureExpression.capture?.maxCollectionSize ?? probe.capture?.maxCollectionSize,
          maxFieldCount: captureExpression.capture?.maxFieldCount ?? probe.capture?.maxFieldCount,
          maxLength: captureExpression.capture?.maxLength ?? probe.capture?.maxLength,
        },
      })
    } catch (err) {
      const captureExpressionError = new Error(
        `Cannot compile capture expression: ${captureExpression.name} (probe: ${probe.id}, version: ${probe.version})`
      )
      ;(captureExpressionError as ErrorWithCause).cause = err
      throw captureExpressionError
    }
  }

  const getFunction = createCachedFunctionFactory(
    (contextKeys: string[], expression: string) => `${contextKeys.join(',')}:${expression}`,
    (contextKeys: string[], expression: string) =>
      // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
      new Function(...contextKeys, `return ${expression}`) as (...args: any[]) => unknown
  )

  return {
    expressions,
    evaluateExpression: (expression: string, context: Record<string, any>) =>
      callWithContext(context, (thisValue, contextKeys, contextValues) =>
        getFunction(contextKeys, expression).call(thisValue, ...contextValues)
      ),
  }
}

function callWithContext<T>(
  context: Record<string, any>,
  call: (thisValue: any, contextKeys: string[], contextValues: any[]) => T
): T {
  const { this: thisValue, ...otherContext } = context
  const contextKeys = Object.keys(otherContext)
  const contextValues = Object.values(otherContext)
  return call(thisValue, contextKeys, contextValues)
}

function createCachedFunctionFactory<TFunction extends (...args: any[]) => any, TKeyParts extends unknown[]>(
  getCacheKey: (...keyParts: TKeyParts) => string,
  createFunction: (...keyParts: TKeyParts) => TFunction
): (...keyParts: TKeyParts) => TFunction {
  const functionCache = new Map<string, TFunction>()
  return (...keyParts: TKeyParts) => {
    const cacheKey = getCacheKey(...keyParts)
    let fn = functionCache.get(cacheKey)
    if (!fn) {
      fn = createFunction(...keyParts)
      functionCache.set(cacheKey, fn)
    }
    return fn
  }
}
