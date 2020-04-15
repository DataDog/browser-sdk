'use strict'

const replace = require('replace-in-file')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const spawn = require('child_process').spawn

const emojiNameMap = require('emoji-name-map')

const lernaConfig = require('../lerna.json')

const CHANGELOG_FILE = 'CHANGELOG.md'

async function main() {
  const lastTagHash = await executeCommand('git rev-list --tags --max-count=1')
  const lastTagName = await executeCommand(`git describe --tags ${lastTagHash}`)

  const commits = await executeCommand(`git log ${lastTagName.trimEnd()}..HEAD --pretty=format:"- %s"`)

  const changesWithEmojis = await emojiNameToUnicode(`# Changelog\n\n## v${lernaConfig.version}\n\n${commits}`)

  const changesWithPullRequestLinks = changesWithEmojis.replace(
    /\(#(\d+)\)/gm,
    (match, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`
  )

  await replace({
    files: CHANGELOG_FILE,
    from: new RegExp('# Changelog', 'g'),
    to: changesWithPullRequestLinks,
  })

  await spawnCommand(process.env.EDITOR, [CHANGELOG_FILE])

  await executeCommand(`git add ${CHANGELOG_FILE}`)
}

async function executeCommand(command) {
  const commandResult = await exec(command)
  if (commandResult.stderr) {
    throw commandResult.stderr
  }
  return commandResult.stdout
}

function spawnCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', () => reject())
    child.on('close', () => resolve())
    child.on('exit', () => resolve())
  })
}

async function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')
  return changes.replace(emojiNameRegex, (emoji) => emojiNameMap.get(emoji) || emoji)
}

main().catch((e) => {
  console.error('\nStacktrace:\n', e)
  process.exit(1)
})
