import { command } from '../lib/command.ts'
import { runMain } from '../lib/executionUtils.ts'
import { buildVitestCommand } from './lib/unitTestArguments.ts'

runMain(() => {
  const vitestCommand = buildVitestCommand(process.argv.slice(2))
  const vitestArguments = [...(vitestCommand.watch ? [] : ['run']), ...vitestCommand.arguments]

  command`yarn vitest ${vitestArguments}`.withLogs().run()
})
