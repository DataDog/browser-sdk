import { command } from '../../lib/command.ts'
import { spawnCommand, printError, runMain } from '../../lib/executionUtils.ts'
import { modifyFile } from '../../lib/filesUtils.ts'
import { addNewChangesToChangelog } from './lib/addNewChangesToChangelog.ts'
import { CHANGELOG_FILE } from './lib/constants.ts'

runMain(async () => {
  if (!process.env.EDITOR) {
    printError('Please configure your environment variable EDITOR')
    process.exit(1)
  }

  await modifyFile(CHANGELOG_FILE, addNewChangesToChangelog)

  await spawnCommand(process.env.EDITOR, [CHANGELOG_FILE])

  command`yarn run prettier --write ${CHANGELOG_FILE}`.run()

  command`git add ${CHANGELOG_FILE}`.run()
})
