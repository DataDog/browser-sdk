// Internal exports for use by other packages if needed
export { onEntry, onReturn, onThrow } from './domain/api'
export {
  addProbe,
  removeProbe,
  getProbes,
  clearProbes,
  initializeProbe,
  checkGlobalSnapshotBudget,
} from './domain/probes'
export { capture } from './domain/capture'
export { captureStackTrace, parseStackTrace } from './domain/stacktrace'
export { compile } from './domain/expression'
export { compileSegments, templateRequiresEvaluation, evaluateProbeMessage, browserInspect } from './domain/template'
export { evaluateProbeCondition } from './domain/condition'

export type { Probe, InitializedProbe, ProbeWhere, ProbeWhen, ProbeSampling } from './domain/probes'
export type { CaptureOptions, CapturedValue } from './domain/capture'
export type { StackFrame } from './domain/stacktrace'
export type { ExpressionNode } from './domain/expression'
export type { TemplateSegment, CompiledTemplate, ProbeWithTemplate } from './domain/template'
export type { ProbeWithCondition } from './domain/condition'
