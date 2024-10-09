const { readFile } = require('fs/promises')
const fs = require('fs')

const emojiNameMap = require('emoji-name-map')

const { browserSdkVersion } = require('../../../lib/browserSdkVersion')
const { command } = require('../../../lib/command')
const { getAffectedPackages } = require('./getAffectedPackages')
const { CHANGELOG_FILE, CONTRIBUTING_FILE, PUBLIC_EMOJI_PRIORITY, INTERNAL_EMOJI_PRIORITY } = require('./constants')

const FIRST_EMOJI_REGEX = /\p{Extended_Pictographic}/u

/**
 * @param previousContent {string}
 * @returns {Promise<string>}
 */
exports.addNewChangesToChangelog = async (previousContent) => {
  const emojisLegend = await getEmojisLegend()
  const changeLists = getChangeLists()

  return `\
# Changelog

${emojisLegend}

---

## v${browserSdkVersion}

${changeLists}
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

function getChangeLists() {
  const lastTagName = getLastReleaseTagName()
  const commits = command`git log ${[`${lastTagName}..HEAD`, '--pretty=format:%H %s']}`.run().split('\n')

  const internalChanges = []
  const publicChanges = []

  commits.forEach((commit) => {
    const spaceIndex = commit.indexOf(' ')
    const hash = commit.slice(0, spaceIndex)
    const message = commit.slice(spaceIndex + 1)
    if (isVersionMessage(message)) {
      return
    }

    const change = formatChange(hash, message)
    const emoji = findFirstEmoji(change)
    if (PUBLIC_EMOJI_PRIORITY.includes(emoji)) {
      publicChanges.push(change)
    } else {
      internalChanges.push(change)
    }
  })

  return [
    formatChangeList('Public Changes', publicChanges, PUBLIC_EMOJI_PRIORITY),
    formatChangeList('Internal Changes', internalChanges, INTERNAL_EMOJI_PRIORITY),
  ]
    .filter(Boolean)
    .join('\n\n')
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
    const emoji = findFirstEmoji(text)
    return emoji && priorityList.includes(emoji) ? priorityList.indexOf(emoji) : Number.MAX_VALUE
  }
  return getFirstRelevantEmojiIndex(a) - getFirstRelevantEmojiIndex(b)
}

function formatChangeList(title, changes, priority) {
  if (!changes.length) {
    return ''
  }

  const formatedList = changes.sort((a, b) => sortByEmojiPriority(a, b, priority)).join('\n')
  return `**${title}:**\n\n${formatedList}`
}

function formatChange(hash, message) {
  let change = `- ${message}`

  const affectedPackages = getAffectedPackages(hash)
  if (affectedPackages.length > 0) {
    const formattedPackages = affectedPackages
      .map((packageDirectoryName) => `[${packageDirectoryName.toUpperCase()}]`)
      .join(' ')
    change += ` ${formattedPackages}`
  }

  return addLinksToGithubIssues(emojiNameToUnicode(change))
}

function emojiNameToUnicode(message) {
  return message.replace(/:[^:\s]*(?:::[^:\s]*)*:/g, (emoji) => emojiNameMap.get(emoji) || emoji)
}

function addLinksToGithubIssues(message) {
  return message.replace(/\(#(\d+)\)/gm, (_, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`)
}

function findFirstEmoji(message) {
  return message.match(FIRST_EMOJI_REGEX)?.[0]
}

function isVersionMessage(line) {
  return /^v\d+\.\d+\.\d+/.test(line)
}
