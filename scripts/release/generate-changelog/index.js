const { command } = require('../../lib/command')
const { spawnCommand, printError, runMain } = require('../../lib/executionUtils')
const { modifyFile } = require('../../lib/filesUtils')
const { addNewChangesToChangelog } = require('./lib/addNewChangesToChangelog')
const { CHANGELOG_FILE } = require('./lib/constants')

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
