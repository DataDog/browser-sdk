'use strict'

const util = require('util')
const readFile = util.promisify(require('fs').readFile)

const emojiNameMap = require('emoji-name-map')

const lernaConfig = require('../lerna.json')
const { executeCommand, spawnCommand, printError, runMain, modifyFile } = require('./utils')

const CHANGELOG_FILE = 'CHANGELOG.md'
const CONTRIBUTING_FILE = 'CONTRIBUTING.md'

runMain(async () => {
  if (!process.env.EDITOR) {
    printError('Please configure your environment variable EDITOR')
    process.exit(1)
  }

  const emojisLegend = await getEmojisLegend()
  const changesList = await getChangesList()

  await modifyFile(
    CHANGELOG_FILE,
    (content) => `\
# Changelog

${emojisLegend}

---

## v${lernaConfig.version}

${changesList}
${content.slice(content.indexOf('\n##'))}`
  )

  await spawnCommand(process.env.EDITOR, [CHANGELOG_FILE])

  await spawnCommand('yarn', ['run', 'prettier', '--write', CHANGELOG_FILE])

  await executeCommand(`git add ${CHANGELOG_FILE}`)
})

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

  const allowedChanges = changesWithEmojis
    .split('\n')
    .filter(isNotVersionEntry)
    .filter(isNotMaintenanceEntry)
    .join('\n')

  const changesWithPullRequestLinks = allowedChanges.replace(
    /\(#(\d+)\)/gm,
    (_, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`
  )

  return changesWithPullRequestLinks
}

function isNotVersionEntry(line) {
  return !/^- v\d+\.\d+\.\d+/.test(line)
}

function isNotMaintenanceEntry(line) {
  return !/^- 👷/.test(line)
}

function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')
  return changes.replace(emojiNameRegex, (emoji) => emojiNameMap.get(emoji) || emoji)
}
