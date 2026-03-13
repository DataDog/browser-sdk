import * as fs from 'node:fs'
import * as util from 'node:util'
import { parseArgs } from 'node:util'
import type { RumEvent } from '@datadog/browser-rum-core/src/rumEvent.types'
import type {
  TelemetryEvent,
  TelemetryErrorEvent,
  TelemetryConfigurationEvent,
  TelemetryUsageEvent,
} from '@datadog/browser-core/src/domain/telemetry/telemetryEvent.types'
import type {
  IntakeRequest,
  LogsIntakeRequest,
  ProfileIntakeRequest,
  RumIntakeRequest,
  ReplayIntakeRequest,
  // eslint-disable-next-line local-rules/disallow-test-import-export-from-src, local-rules/disallow-protected-directory-import
} from '../../../../test/e2e/lib/framework/intakeProxyMiddleware.ts'
import { printLog, printWarning } from '../../../lib/executionUtils.ts'
import { INTAKE_REQUESTS_FILE } from '../state.ts'

export function intake(args: string[]): void {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean', default: !process.stdout.isTTY },
    },
  })

  const [selectorName = 'requests'] = positionals

  if (values.help) {
    printLog('Usage: yarn dev-server intake [selector]\n')
    printLog('Selectors:')
    for (const selector of SELECTORS) {
      printLog(`  ${selector.name.padEnd(20)} ${selector.description}`)
    }
    printLog('\nCommands:')
    printLog('  clear                Clear all recorded intake requests')
    printLog('\nOptions:')
    printLog('  --json     Output NDJSON (default when not a TTY)')
    printLog('  --help     Show this message')
    printLog('\nExamples:')
    printLog('  yarn dev-server intake rum-views | jq .view.loading_time')
    printLog('  yarn dev-server intake rum-errors | jq .error.message')
    printLog('  yarn dev-server intake rum-actions | jq .action.target.name')
    printLog('  yarn dev-server intake logs-events | jq .message')
    return
  }

  if (selectorName === 'clear') {
    fs.writeFileSync(INTAKE_REQUESTS_FILE, '')
    printLog('Intake requests cleared.')
    return
  }

  const selector = SELECTORS.find((s) => s.name === selectorName)
  if (!selector) {
    throw new Error(`Unknown selector: ${selectorName}. Available: ${SELECTORS.map((s) => s.name).join(', ')}`)
  }

  if (!fs.existsSync(INTAKE_REQUESTS_FILE)) {
    printWarning('No intake requests found.')
    return
  }

  const requests = fs
    .readFileSync(INTAKE_REQUESTS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as IntakeRequest)

  for (const item of selector.select(requests)) {
    if (values.json) {
      console.log(JSON.stringify(item))
    } else {
      console.log(util.inspect(item, { colors: true, depth: null }))
    }
  }
}

const SELECTORS: Array<{ name: string; description: string; select: (requests: IntakeRequest[]) => unknown[] }> = [
  {
    name: 'requests',
    description: 'All intake requests',
    select: (requests) => requests,
  },
  {
    name: 'rum-requests',
    description: 'RUM intake requests',
    select: (requests) => requests.filter((r): r is RumIntakeRequest => r.intakeType === 'rum'),
  },
  {
    name: 'rum-events',
    description: 'All RUM events',
    select: (requests) => rumEvents(requests),
  },
  {
    name: 'rum-actions',
    description: 'RUM action events',
    select: (requests) => rumEvents(requests).filter((e) => e.type === 'action'),
  },
  {
    name: 'rum-errors',
    description: 'RUM error events',
    select: (requests) => rumEvents(requests).filter((e) => e.type === 'error'),
  },
  {
    name: 'rum-resources',
    description: 'RUM resource events',
    select: (requests) => rumEvents(requests).filter((e) => e.type === 'resource'),
  },
  {
    name: 'rum-long-tasks',
    description: 'RUM long task events',
    select: (requests) => rumEvents(requests).filter((e) => e.type === 'long_task'),
  },
  {
    name: 'rum-views',
    description: 'RUM view events',
    select: (requests) => rumEvents(requests).filter((e) => e.type === 'view'),
  },
  {
    name: 'rum-vitals',
    description: 'RUM vital events',
    select: (requests) => rumEvents(requests).filter((e) => e.type === 'vital'),
  },
  {
    name: 'logs-requests',
    description: 'Logs intake requests',
    select: (requests) => requests.filter((r): r is LogsIntakeRequest => r.intakeType === 'logs'),
  },
  {
    name: 'logs-events',
    description: 'Logs events',
    select: (requests) =>
      requests.filter((r): r is LogsIntakeRequest => r.intakeType === 'logs').flatMap((r) => r.events),
  },
  {
    name: 'telemetry-events',
    description: 'Telemetry events',
    select: (requests) => telemetryEvents(requests),
  },
  {
    name: 'telemetry-error-events',
    description: 'Telemetry error events',
    select: (requests) =>
      telemetryEvents(requests).filter((e): e is TelemetryErrorEvent => e.telemetry.status === 'error'),
  },
  {
    name: 'telemetry-configuration-events',
    description: 'Telemetry configuration events',
    select: (requests) =>
      telemetryEvents(requests).filter((e): e is TelemetryConfigurationEvent => e.telemetry.type === 'configuration'),
  },
  {
    name: 'telemetry-usage-events',
    description: 'Telemetry usage events',
    select: (requests) =>
      telemetryEvents(requests).filter((e): e is TelemetryUsageEvent => e.telemetry.type === 'usage'),
  },
  {
    name: 'replay-segments',
    description: 'Session replay segments',
    select: (requests) =>
      requests.filter((r): r is ReplayIntakeRequest => r.intakeType === 'replay').map((r) => r.segment),
  },
  {
    name: 'replay-records',
    description: 'Session replay records',
    select: (requests) =>
      requests.filter((r): r is ReplayIntakeRequest => r.intakeType === 'replay').flatMap((r) => r.segment.records),
  },
  {
    name: 'profile-requests',
    description: 'Profiling intake requests',
    select: (requests) => requests.filter((r): r is ProfileIntakeRequest => r.intakeType === 'profile'),
  },
  {
    name: 'profile-events',
    description: 'Profiling events',
    select: (requests) =>
      requests.filter((r): r is ProfileIntakeRequest => r.intakeType === 'profile').map((r) => r.event),
  },
]

function rumEvents(requests: IntakeRequest[]): RumEvent[] {
  return requests
    .filter((r): r is RumIntakeRequest => r.intakeType === 'rum')
    .flatMap((r) => r.events.filter((e): e is RumEvent => e.type !== 'telemetry'))
}

function telemetryEvents(requests: IntakeRequest[]): TelemetryEvent[] {
  return requests
    .filter((r): r is RumIntakeRequest => r.intakeType === 'rum')
    .flatMap((r) => r.events.filter((e): e is TelemetryEvent => e.type === 'telemetry'))
}
