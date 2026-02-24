import { runMain, printLog } from '../lib/executionUtils.ts'
import { start } from './lib/commands/start.ts'
import { stop } from './lib/commands/stop.ts'
import { logs } from './lib/commands/logs.ts'
import { status } from './lib/commands/status.ts'
import { intake } from './lib/commands/intake.ts'

const COMMANDS: Array<{ name: string; description: string; run: (args: string[]) => void | Promise<void> }> = [
  {
    name: 'start',
    description: 'Start the dev server in the background',
    run: start,
  },
  {
    name: 'stop',
    description: 'Stop the dev server',
    run: stop,
  },
  {
    name: 'status',
    description: 'Show the dev server status',
    run: status,
  },
  {
    name: 'logs',
    description: 'Show the dev server logs',
    run: logs,
  },
  {
    name: 'intake',
    description: 'Show intake requests received by the dev server',
    run: intake,
  },
]

runMain(async () => {
  const [commandName, ...commandArgs] = process.argv.slice(2)

  if (!commandName || commandName === '--help' || commandName === '-h') {
    printLog('Usage: yarn dev-server <command> [args]\n')
    printLog('Commands:')
    for (const command of COMMANDS) {
      printLog(`  ${command.name.padEnd(10)} ${command.description}`)
    }
    printLog('\nOptions:')
    printLog('  -h, --help     Show this message')
    return
  }

  const command = COMMANDS.find((c) => c.name === commandName)
  if (!command) {
    throw new Error(`Unknown command: ${commandName}. Available: ${COMMANDS.map((c) => c.name).join(', ')}`)
  }

  await command.run(commandArgs)
})
