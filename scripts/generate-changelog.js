'use strict'

const util = require('util')
const readFile = util.promisify(require('fs').readFile)
const replace = require('replace-in-file')

const emojiNameMap = require('emoji-name-map')

const lernaConfig = require('../lerna.json')
const { executeCommand, spawnCommand, printError, logAndExit } = require('./utils')

const CHANGELOG_FILE = 'CHANGELOG.md'
const CONTRIBUTING_FILE = 'CONTRIBUTING.md'

async function main() {
  if (!process.env.EDITOR) {
    printError('Please configure your environment variable EDITOR')
    process.exit(1)
  }

  const emojisLegend = await getEmojisLegend()
  const changesList = await getChangesList()

  await replace({
    files: CHANGELOG_FILE,
    from: /.*?^(?=##)/ms, // Replace the start of the file until the first ## title.
    to: `\
# Changelog

${emojisLegend}

---

## v${lernaConfig.version}

${changesList}

`,
  })

  await spawnCommand(process.env.EDITOR, [CHANGELOG_FILE])

  await spawnCommand('yarn', ['run', 'prettier', '--write', CHANGELOG_FILE])

  await executeCommand(`git add ${CHANGELOG_FILE}`)
}

async function getEmojisLegend() {
  const contributing = await readFile(CONTRIBUTING_FILE, { encoding: 'utf-8' })
  let collectLines = false

  const lines = ['> **Legend**']

  for (const line of contributing.split('\n')) {
    if (line.startsWith('### User-facing changes')) {
      collectLines = true
    } else if (collectLines) {
      if (line.startsWith('#')) {
        break
      } else if (line) {
        lines.push('>', `> ${line}`)
      }
    }
  }

  return lines.join('\n')
}

async function getChangesList() {
  await executeCommand('git fetch --tags -q')
  const lastTagHash = await executeCommand('git rev-list --tags --max-count=1')
  const lastTagName = await executeCommand(`git describe --tags ${lastTagHash}`)

  const commits = await executeCommand(`git log ${lastTagName.trimEnd()}..HEAD --pretty=format:"- %s"`)

  const changesWithEmojis = emojiNameToUnicode(commits)

  const changesWithPullRequestLinks = changesWithEmojis.replace(
    /\(#(\d+)\)/gm,
    (_, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`
  )

  return changesWithPullRequestLinks
}

function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')
  return changes.replace(emojiNameRegex, (emoji) => emojiNameMap.get(emoji) || emoji)
}

main().catch(logAndExit)
