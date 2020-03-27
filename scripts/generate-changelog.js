'use strict'

const replace = require('replace-in-file')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const spawn = util.promisify(require('child_process').spawn)

const name = require('emoji-name-map')

const lernaConfig = require('../lerna.json')

const CHANGELOG_FILE = 'CHANGELOG.md'

async function main() {
  const lastTagHash = await executeCommand('git rev-list --tags --max-count=1')
  const lastTagName = await executeCommand(`git describe --tags ${lastTagHash}`)

  const oldTag = lastTagName.replace(/\n$/, '')
  const commits = await executeCommand(`git log ${oldTag}..HEAD --pretty=format:"- %s"`)

  const changesWithEmojis = await emojiNameToUnicode(`# Changelog\n\n## v${lernaConfig.version}\n\n${commits}`)

  const changesWhihPullRequestLinks = changesWithEmojis.replace(
    /\(#(\d+)\)/gm,
    (match, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`
  )

  await replace({
    files: CHANGELOG_FILE,
    from: new RegExp('# Changelog', 'g'),
    to: changesWhihPullRequestLinks,
  })

  const openEditorCmd = await spawn(process.env.EDITOR, [CHANGELOG_FILE], { stdio: 'inherit', detached: true })
  if (openEditorCmd.stderr) {
    throw openEditorCmd.stderr
  }
}

async function executeCommand(command) {
  const commandResult = await exec(command)
  if (commandResult.stderr) {
    throw commandResult.stderr
  }
  return commandResult.stdout
}

async function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')

  let matches
  while ((matches = emojiNameRegex.exec(changes))) {
    if (!!matches) {
      await matches.map((match) => {
        changes = changes.replace(match, name.get(match) || match)
      })
    }
  }

  return changes
}

main().catch((e) => {
  console.error('\nStacktrace:\n', e)
  process.exit(1)
})
