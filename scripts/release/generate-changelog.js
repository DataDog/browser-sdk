'use strict'

const util = require('util')
const readFile = util.promisify(require('fs').readFile)

const emojiNameMap = require('emoji-name-map')

const { browserSdkVersion } = require('../lib/browser-sdk-version')
const { spawnCommand, printError, runMain } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { modifyFile } = require('../lib/files-utils')

const CHANGELOG_FILE = '../../CHANGELOG.md'
const CONTRIBUTING_FILE = '../../CONTRIBUTING.md'
const PUBLIC_EMOJI_PRIORITY = ['💥', '✨', '🐛', '⚡️', '📝', '⚗️']
const INTERNAL_EMOJI_PRIORITY = [
  '👷',
  '🔧',
  '📦', // build conf
  '♻️',
  '🎨', // refactoring
  '🧪',
  '✅', // tests
  '🔇',
  '🔊', // telemetry
  '👌',
  '📄',
]
const EMOJI_REGEX = /^\p{Emoji_Presentation}/u
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

## v${browserSdkVersion}

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

  lines.push('>', '> See [Gitmoji](https://gitmoji.dev/) for a guide on the emojis used.')

  return lines.join('\n')
}

function getChangesList() {
  command`git fetch --tags -f -q`.run()
  const lastTagHash = command`git rev-list --tags --max-count=1`.run().trim()
  const lastTagName = command`git describe --tags ${lastTagHash}`.run()

  const commits = command`git log ${lastTagName.trimEnd()}..HEAD --pretty=format:%s`.run()
  const changesWithEmojis = emojiNameToUnicode(commits)

  let changes = changesWithEmojis.split('\n').filter(isNotVersionEntry)
  let internalChanges = []
  let publicChanges = []

  changes.forEach((entry) => {
    let trimmedEntry = entry.trim()
    if (PUBLIC_EMOJI_PRIORITY.some((emoji) => trimmedEntry.startsWith(emoji))) {
      publicChanges.push(entry)
    } else {
      internalChanges.push(entry)
    }
  })

  const sortAndFormat = (entries, priority) =>
    entries.sort((a, b) => sortByEmojiPriority(a, b, priority)).map((entry) => `- ${entry}`)
  internalChanges = sortAndFormat(internalChanges, INTERNAL_EMOJI_PRIORITY)
  publicChanges = sortAndFormat(publicChanges, PUBLIC_EMOJI_PRIORITY)

  return `
**Public Changes:**

${publicChanges.join('\n')}

**Internal Changes:**

${internalChanges.join('\n')}
`.replace(/\(#(\d+)\)/gm, (_, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`)
}

function sortByEmojiPriority(a, b, priorityList) {
  const getFirstRelevantEmojiIndex = (text) => {
    const matches = text.match(EMOJI_REGEX) || []
    const emoji = matches.find((emoji) => priorityList.includes(emoji))
    return emoji ? priorityList.indexOf(emoji) : Number.MAX_VALUE
  }
  return getFirstRelevantEmojiIndex(a) - getFirstRelevantEmojiIndex(b)
}

function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')
  return changes.replace(emojiNameRegex, (emoji) => emojiNameMap.get(emoji) || emoji)
}

function isNotVersionEntry(line) {
  return !/^v\d+\.\d+\.\d+/.test(line)
}
