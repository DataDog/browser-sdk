import { parseArgs } from 'node:util'
import { runMain } from '../lib/executionUtils.ts'
import { checkCordons, type CordonTarget } from './lib/checkCordons.ts'

/**
 * Fail if a cordon is active on the given environment(s) or datacenter(s).
 * Set OVERRIDE_CORDON=<incident or exception link> to bypass the check for an approved freeze exception.
 * Usage:
 * node check-cordons.ts --environment prod [--datacenter us1.prod.dog]
 */
if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main(...process.argv.slice(2)))
}

export async function main(...args: string[]): Promise<void> {
  const {
    values: { environment = [], datacenter = [] },
  } = parseArgs({
    args,
    options: {
      environment: { type: 'string', multiple: true },
      datacenter: { type: 'string', multiple: true },
    },
  })

  const targets: CordonTarget[] = [
    ...environment.map((name): CordonTarget => ({ type: 'environment', name })),
    ...datacenter.map((name): CordonTarget => ({ type: 'datacenter', name })),
  ]

  if (targets.length === 0) {
    throw new Error('At least one --environment or --datacenter argument is required')
  }

  await checkCordons(targets)
}
