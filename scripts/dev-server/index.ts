import { runMain, printLog } from '../lib/executionUtils.ts'
import { start } from './lib/commands/start.ts'
import { stop } from './lib/commands/stop.ts'
import { logs } from './lib/commands/logs.ts'
import { status } from './lib/commands/status.ts'

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
]

runMain(async () => {
  const [commandName, ...commandArgs] = process.argv.slice(2)

  if (!commandName || commandName === '--help' || commandName === '-h') {
    printLog(`Usage: yarn dev-server <command> [args]

Commands:
${COMMANDS.map((c) => `  ${c.name.padEnd(10)} ${c.description}`).join('\n')}

Options:
  -h, --help     Show this message`)
    return
  }

  const command = COMMANDS.find((c) => c.name === commandName)
  if (!command) {
    throw new Error(`Unknown command: ${commandName}. Available: ${COMMANDS.map((c) => c.name).join(', ')}`)
  }

  await command.run(commandArgs)
})
