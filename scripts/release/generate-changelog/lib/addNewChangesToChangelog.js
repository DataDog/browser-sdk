const { readFile } = require('fs/promises')
const fs = require('fs')

const emojiNameMap = require('emoji-name-map')

const { browserSdkVersion } = require('../../../lib/browserSdkVersion')
const { command } = require('../../../lib/command')
const { getAffectedPackages } = require('./getAffectedPackages')
const { CHANGELOG_FILE, CONTRIBUTING_FILE, PUBLIC_EMOJI_PRIORITY, INTERNAL_EMOJI_PRIORITY } = require('./constants')

const EMOJI_REGEX = /^\p{Emoji_Presentation}/u

/**
 * @param previousContent {string}
 * @returns {Promise<string>}
 */
exports.addNewChangesToChangelog = async (previousContent) => {
  const emojisLegend = await getEmojisLegend()
  const changesList = getChangesList()

  return `\
# Changelog

${emojisLegend}

---

## v${browserSdkVersion}

${changesList}
${previousContent.slice(previousContent.indexOf('\n##'))}`
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

  lines.push('>', '> See [Gitmoji](https://gitmoji.dev/) for a guide on the emojis used.')

  return lines.join('\n')
}

function getChangesList() {
  const lastTagName = getLastReleaseTagName()
  const commits = command`git log ${[`${lastTagName}..HEAD`, '--pretty=format:%H %s']}`.run()
  const changesWithEmojis = emojiNameToUnicode(commits)

  let changes = changesWithEmojis.split('\n').filter(isNotVersionEntry)
  let internalChanges = []
  let publicChanges = []

  changes.forEach((entry) => {
    let trimmedEntry = entry.trim()
    const hash = trimmedEntry.split(' ')[0]
    const message = trimmedEntry.slice(trimmedEntry.indexOf(' ') + 1)
    const affectedPackages = getAffectedPackages(hash)

    const formattedPackages = affectedPackages
      .map((packageDirectoryName) => `[${packageDirectoryName.toUpperCase()}]`)
      .join(' ')

    if (PUBLIC_EMOJI_PRIORITY.some((emoji) => message.startsWith(emoji))) {
      publicChanges.push(`${message} ${formattedPackages}`)
    } else {
      internalChanges.push(`${message} ${formattedPackages}`)
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

function getLastReleaseTagName() {
  const changelog = fs.readFileSync(CHANGELOG_FILE, { encoding: 'utf-8' })
  const match = changelog.match(/^## (v\d+\.\d+\.\d+.*)/m)
  if (!match) {
    throw new Error('Could not find the last release version in the changelog')
  }
  return match[1]
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
