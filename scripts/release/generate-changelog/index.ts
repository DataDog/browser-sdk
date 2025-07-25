import { command } from '../../lib/command'
import { spawnCommand, printError, runMain } from '../../lib/executionUtils'
import { modifyFile } from '../../lib/filesUtils'
import { addNewChangesToChangelog } from './lib/addNewChangesToChangelog'
import { CHANGELOG_FILE } from './lib/constants'

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
