/**
 * Instrumented versions of the functions
 * These follow the live-debugger instrumentation pattern
 */

// Global hooks injected by live-debugger SDK
declare const $dd_probes: (functionId: string) => any[] | undefined
declare const $dd_entry: (probes: any[], self: any, args: Record<string, any>) => void
declare const $dd_return: (probes: any[], value: any, self: any, args: Record<string, any>, locals: Record<string, any>) => any
declare const $dd_throw: (probes: any[], error: Error, self: any, args: Record<string, any>) => void

export function add1(a: number, b: number): number {
  const $dd_p = $dd_probes('instrumented.ts;add1')
  try {
    if ($dd_p) $dd_entry($dd_p, null, { a, b })
    const result = a + b
    return $dd_p ? $dd_return($dd_p, result, null, { a, b }, { result }) : result
  } catch (e) {
    if ($dd_p) $dd_throw($dd_p, e as Error, null, { a, b })
    throw e
  }
}

export function add2(a: number, b: number): number {
  const $dd_p = $dd_probes('instrumented.ts;add2')
  try {
    if ($dd_p) $dd_entry($dd_p, null, { a, b })
    const result = a + b
    return $dd_p ? $dd_return($dd_p, result, null, { a, b }, { result }) : result
  } catch (e) {
    if ($dd_p) $dd_throw($dd_p, e as Error, null, { a, b })
    throw e
  }
}
