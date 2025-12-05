import { compile } from './expression.js'
import { templateRequiresEvaluation, compileSegments } from './template.js'

// Sampling rate limits
const MAX_SNAPSHOTS_PER_SECOND_GLOBALLY = 25
const MAX_SNAPSHOTS_PER_SECOND_PER_PROBE = 1
const MAX_NON_SNAPSHOTS_PER_SECOND_PER_PROBE = 5000

// Global snapshot rate limiting
let globalSnapshotSamplingRateWindowStart = 0
let snapshotsSampledWithinTheLastSecond = 0

/**
 * @typedef {Object} InitializedProbe
 * @property {string} id
 * @property {number} version
 * @property {string} type
 * @property {Object} where
 * @property {string|Function} template - Either the original template string or compiled template function
 * @property {boolean} templateRequiresEvaluation - Added during initialization by initializeProbe()
 * @property {string} [condition] - Compiled condition code, added during initialization if when clause exists
 * @property {boolean} captureSnapshot
 * @property {Object} capture
 * @property {Object} sampling
 * @property {string} evaluateAt - 'ENTRY' or 'EXIT'
 * @property {number} msBetweenSampling - Milliseconds between samples based on sampling rate
 * @property {number} lastCaptureMs - Timestamp of last capture in milliseconds
 * @property {Object} [location]
 */

/**
 * Get an initialized probe by ID
 * @param {string} id - The probe ID
 * @returns {InitializedProbe} - The initialized probe configuration
 */
export function getProbe (id) {
  const probe = probes.get(id)
  if (!probe) throw new Error(`Probe with id ${id} not found`)
  // @ts-expect-error - Probe has been initialized with templateRequiresEvaluation property by initializeProbe()
  return probe
}

/**
 * Check global snapshot sampling budget
 * @param {number} now - Current timestamp in milliseconds
 * @param {boolean} captureSnapshot - Whether this probe captures snapshots
 * @returns {boolean} - True if within budget, false if rate limited
 */
export function checkGlobalSnapshotBudget (now, captureSnapshot) {
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
  if (snapshotsSampledWithinTheLastSecond >= MAX_SNAPSHOTS_PER_SECOND_GLOBALLY) {
    return false
  }

  // Increment counter and allow
  snapshotsSampledWithinTheLastSecond++
  return true
}

const probes = new Map([
  // Method log probe with snapshot on entry and return, evaluated at entry
  ['1', {
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8c',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'index.js', methodName: 'handlerA' },
    template: 'Executed index.js.handlerA, it took {@duration}ms',
    segments: [
      { str: 'Executed index.js.handlerA, it took ' },
      { dsl: '@duration', json: { ref: '@duration' } },
      { str: 'ms' }
    ],
    captureSnapshot: true,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 5000 },
    evaluateAt: 'ENTRY'
  }],
  // Method log probe with snapshot on entry and return, evaluated at exit
  ['2', {
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8d',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'index.js', methodName: 'handlerA' },
    template: 'Executed index.js.handlerA, it took {@duration}ms',
    segments: [
      { str: 'Executed index.js.handlerA, it took ' },
      { dsl: '@duration', json: { ref: '@duration' } },
      { str: 'ms' }
    ],
    captureSnapshot: true,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 5000 },
    evaluateAt: 'EXIT'
  }],
  // Method log probe without snapshot, evaluated at exit
  ['3', {
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8e',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'index.js', methodName: 'handlerA' },
    template: 'Executed index.js.handlerA, it took {@duration}ms',
    segments: [
      { str: 'Executed index.js.handlerA, it took ' },
      { dsl: '@duration', json: { ref: '@duration' } },
      { str: 'ms' }
    ],
    captureSnapshot: false,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 5000 },
    evaluateAt: 'EXIT'
  }],
  // Method log probe with condition - only fires if duration > 100ms
  ['4', {
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8f',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'index.js', methodName: 'handlerA' },
    when: {
      dsl: '@duration > 100',
      json: { gt: [{ ref: '@duration' }, 100] }
    },
    template: 'Slow execution detected: {@duration}ms',
    segments: [
      { str: 'Slow execution detected: ' },
      { dsl: '@duration', json: { ref: '@duration' } },
      { str: 'ms' }
    ],
    captureSnapshot: true,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 5000 },
    evaluateAt: 'EXIT'
  }],
])

// Initialize all probes
for (const probe of probes.values()) {
  initializeProbe(probe)
}

/**
 * Initialize a probe by preprocessing template segments, conditions, and sampling
 * @param {Object} probe - The probe configuration
 */
function initializeProbe (probe) {
  // Compile condition if present
  try {
    if (probe.when?.json) {
      probe.condition = compile(probe.when.json)
    }
  } catch (err) {
    console.error(
      `Cannot compile condition expression: ${probe.when.dsl} (probe: ${probe.id}, version: ${probe.version})`,
      err
    )
  }

  // Optimize for fast calculations when probe is hit
  probe.templateRequiresEvaluation = templateRequiresEvaluation(probe.segments)
  if (probe.templateRequiresEvaluation) {
    const segmentsCode = compileSegments(probe.segments)

    // Pre-build the function body template with the segments code and options
    // The actual function will be created at runtime with dynamic parameter names
    // But at least we avoid rebuilding this string and the options object every time
    const fnBodyTemplate = `
      const $dd_inspect = browserInspect;
      const $dd_segmentInspectOptions = {
        depth: 0,
        maxArrayLength: 3,
        maxStringLength: 8 * 1024,
        breakLength: Infinity
      };
      return ${segmentsCode};
    `

    // Cache compiled functions by context keys to avoid recreating them
    const functionCache = new Map()

    // Store the template with a factory that caches functions
    probe.template = {
      bodyTemplate: fnBodyTemplate,
      createFunction: (contextKeys) => {
        const cacheKey = contextKeys.join(',')
        let fn = functionCache.get(cacheKey)
        if (!fn) {
          fn = new Function('browserInspect', ...contextKeys, fnBodyTemplate)
          functionCache.set(cacheKey, fn)
        }
        return fn
      }
    }
  }
  delete probe.segments

  // Optimize for fast calculations when probe is hit - calculate sampling budget
  const snapshotsPerSecond = probe.sampling?.snapshotsPerSecond ?? (probe.captureSnapshot
    ? MAX_SNAPSHOTS_PER_SECOND_PER_PROBE
    : MAX_NON_SNAPSHOTS_PER_SECOND_PER_PROBE)
  probe.msBetweenSampling = 1 / snapshotsPerSecond * 1000 // Convert to milliseconds
  probe.lastCaptureMs = 0
}
