'use strict'

const util = require('util')
const readFile = util.promisify(require('fs').readFile)

const emojiNameMap = require('emoji-name-map')

const { getBrowserSdkVersion } = require('../lib/browser-sdk-version')
const { spawnCommand, printError, runMain } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { modifyFile } = require('../lib/files-utils')

const CHANGELOG_FILE = 'CHANGELOG.md'
const CONTRIBUTING_FILE = 'CONTRIBUTING.md'
const EMOJI_PRIORITY = ['💥', '✨', '🐛', '⚗️', '♻️']
const START_WITH_EMOJI = /^\p{Emoji_Presentation}/u

runMain(async () => {
  if (!process.env.EDITOR) {
    printError('Please configure your environment variable EDITOR')
    process.exit(1)
  }

  const emojisLegend = await getEmojisLegend()
  const changesList = getChangesList()

  await modifyFile(
    CHANGELOG_FILE,
    (content) => `\
# Changelog

${emojisLegend}

---

## v${getBrowserSdkVersion()}

${changesList}
${content.slice(content.indexOf('\n##'))}`
  )

  await spawnCommand(process.env.EDITOR, [CHANGELOG_FILE])

  command`yarn run prettier --write ${CHANGELOG_FILE}`.run()

  command`git add ${CHANGELOG_FILE}`.run()
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

function getChangesList() {
  command`git fetch --tags -f -q`.run()
  const lastTagHash = command`git rev-list --tags --max-count=1`.run().trim()
  const lastTagName = command`git describe --tags ${lastTagHash}`.run()

  const commits = command`git log ${lastTagName.trimEnd()}..HEAD --pretty=format:%s`.run()

  const changesWithEmojis = emojiNameToUnicode(commits)

  const allowedChanges = changesWithEmojis
    .split('\n')
    .filter(isNotVersionEntry)
    .filter(isNotMaintenanceEntry)
    .sort(byEmojiPriority)
    .map((entry) => `- ${entry}`)
    .join('\n')

  // changes with pull request links
  return allowedChanges.replace(
    /\(#(\d+)\)/gm,
    (_, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`
  )
}

function isNotVersionEntry(line) {
  return !/^v\d+\.\d+\.\d+/.test(line)
}

function isNotMaintenanceEntry(line) {
  return !/^👷/.test(line)
}

function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')
  return changes.replace(emojiNameRegex, (emoji) => emojiNameMap.get(emoji) || emoji)
}

function byEmojiPriority(a, b) {
  const priorityA = computeEmojiPriority(a)
  const priorityB = computeEmojiPriority(b)
  if (priorityA < priorityB) {
    return -1
  }
  if (priorityB > priorityA) {
    return 1
  }
  return 0
}

function computeEmojiPriority(entry) {
  const match = START_WITH_EMOJI.exec(entry)
  if (match && EMOJI_PRIORITY.includes(match[0])) {
    return EMOJI_PRIORITY.indexOf(match[0])
  }
  return Number.MAX_VALUE
}
