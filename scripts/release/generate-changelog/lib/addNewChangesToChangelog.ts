import { readFile } from 'fs/promises'
import * as fs from 'fs'

import { browserSdkVersion } from '../../../lib/browserSdkVersion'
import { command } from '../../../lib/command'
import { getAffectedPackages } from './getAffectedPackages'
import { CHANGELOG_FILE, CONTRIBUTING_FILE, PUBLIC_EMOJI_PRIORITY, INTERNAL_EMOJI_PRIORITY } from './constants'
const emojiNameMap = require('emoji-name-map') as Map<string, string>

const FIRST_EMOJI_REGEX = /\p{Extended_Pictographic}/u

/**
 * Add new changes to the changelog.
 *
 * @param previousContent - {string}
 * @returns {Promise<string>}
 */
export async function addNewChangesToChangelog(previousContent: string): Promise<string> {
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

async function getEmojisLegend(): Promise<string> {
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

function getChangeLists(): string {
  const previousChangelog = fs.readFileSync(CHANGELOG_FILE, { encoding: 'utf-8' })

  let collectInternal = false
  let collectPublic = false
  const changes = {
    public: [] as string[],
    internal: [] as string[],
  }

  const gitLogCommand = command`git log --no-merges --pretty=format:%h|%s`

  for (const line of gitLogCommand.run().split('\n')) {
    if (isVersionMessage(line) && isStagingBumpMessage(line)) {
      const [hash, message] = line.split('|', 2)
      const formattedMessage = formatChange(hash, message)

      if (previousChangelog.includes(formattedMessage)) {
        break
      }

      if (
        collectInternal &&
        [...INTERNAL_EMOJI_PRIORITY, ...PUBLIC_EMOJI_PRIORITY].includes((findFirstEmoji(message) as any) || '')
      ) {
        collectInternal = false
        collectPublic = true
      }

      if (collectPublic) {
        changes.public.push(formattedMessage)
      } else if (collectInternal) {
        changes.internal.push(formattedMessage)
      }
    } else if (isStagingBumpMessage(line)) {
      collectInternal = true
      collectPublic = false
    }
  }

  const parts = [
    formatChangeList('Public Changes', changes.public, PUBLIC_EMOJI_PRIORITY),
    formatChangeList('Internal Changes', changes.internal, INTERNAL_EMOJI_PRIORITY),
  ].filter(Boolean)

  return parts.join('\n\n')
}

function sortByEmojiPriority(a: string, b: string, priorityList: readonly string[]): number {
  const getFirstRelevantEmojiIndex = (text: string): number => {
    const emoji = findFirstEmoji(text)
    return emoji && priorityList.includes(emoji) ? priorityList.indexOf(emoji) : Number.MAX_VALUE
  }
  return getFirstRelevantEmojiIndex(a) - getFirstRelevantEmojiIndex(b)
}

function formatChangeList(title: string, changes: string[], priority: readonly string[]): string {
  if (!changes.length) {
    return ''
  }

  const formatedList = changes.sort((a, b) => sortByEmojiPriority(a, b, priority)).join('\n')
  return `**${title}:**\n\n${formatedList}`
}

function formatChange(hash: string, message: string): string {
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

function emojiNameToUnicode(message: string): string {
  return message.replace(/:[^:\s]*(?:::[^:\s]*)*:/g, (emoji) => emojiNameMap.get(emoji) || emoji)
}

function addLinksToGithubIssues(message: string): string {
  return message.replace(/\(#(\d+)\)/gm, (_, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`)
}

function findFirstEmoji(message: string): string | undefined {
  return message.match(FIRST_EMOJI_REGEX)?.[0]
}

function isVersionMessage(line: string): boolean {
  return /^v\d+\.\d+\.\d+/.test(line)
}

function isStagingBumpMessage(line: string): boolean {
  return /Bump staging to staging-\d+/.test(line)
}
