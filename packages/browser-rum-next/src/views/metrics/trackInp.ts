import type { InteractionToNextPaint } from '../types'

interface InpEntry {
  duration: number
  startTime: number
  processingStart: number
  processingEnd: number
  target?: Element
  interactionId?: number
}

interface InteractionData {
  duration: number
  startTime: number
  target?: Element
  interactionId: number
}

interface GroupData {
  startTime: number
  processingStart: number
  processingEnd: number
  referenceRenderTime: number
}

const MAX_INTERACTIONS = 10

export interface InpTracker {
  process(entry: InpEntry): void
  get(): InteractionToNextPaint | undefined
}

export function trackInp(): InpTracker {
  // Map from interactionId to max duration + target
  const interactions = new Map<number, InteractionData>()
  // Map from interactionId to group data for sub_parts computation
  const groups = new Map<number, GroupData>()
  // Sorted list of top interactions by duration (descending)
  let topInteractions: InteractionData[] = []

  function updateTopInteractions(): void {
    const all = Array.from(interactions.values()).sort((a, b) => b.duration - a.duration)
    topInteractions = all.slice(0, MAX_INTERACTIONS)

    // Prune groups for interactions no longer in the top list
    const topIds = new Set(topInteractions.map((i) => i.interactionId))
    for (const [id] of groups) {
      if (!topIds.has(id)) {
        // Only remove if this id is a "primary" group entry (not an alias)
        // We need to check if any top interaction has an alias pointing to this group
        let isAliased = false
        for (const topId of topIds) {
          if (topId !== id && groups.get(topId) === groups.get(id)) {
            isAliased = true
            break
          }
        }
        if (!isAliased) {
          groups.delete(id)
        }
      }
    }
  }

  function processGroup(entry: InpEntry): void {
    if (!entry.interactionId || !entry.processingStart || !entry.processingEnd) return

    const renderTime = entry.startTime + entry.duration
    const existing = groups.get(entry.interactionId)

    if (existing) {
      existing.startTime = Math.min(entry.startTime, existing.startTime)
      existing.processingStart = Math.min(entry.processingStart, existing.processingStart)
      existing.processingEnd = Math.max(entry.processingEnd, existing.processingEnd)
      return
    }

    // Try to merge with an existing group within 8ms render window
    for (const [, group] of groups) {
      if (Math.abs(renderTime - group.referenceRenderTime) <= 8) {
        group.startTime = Math.min(entry.startTime, group.startTime)
        group.processingStart = Math.min(entry.processingStart, group.processingStart)
        group.processingEnd = Math.max(entry.processingEnd, group.processingEnd)
        groups.set(entry.interactionId, group) // alias to same group object
        return
      }
    }

    // New group
    groups.set(entry.interactionId, {
      startTime: entry.startTime,
      processingStart: entry.processingStart,
      processingEnd: entry.processingEnd,
      referenceRenderTime: renderTime,
    })
  }

  function computeSubParts(interactionId: number, inpDuration: number): InteractionToNextPaint['subParts'] | undefined {
    const group = groups.get(interactionId)
    if (!group) return undefined

    const nextPaintTime = Math.max(group.startTime + inpDuration, group.processingStart)
    const processingEnd = Math.min(group.processingEnd, nextPaintTime)

    return {
      inputDelay: group.processingStart - group.startTime,
      processingDuration: processingEnd - group.processingStart,
      presentationDelay: nextPaintTime - processingEnd,
    }
  }

  return {
    process(entry: InpEntry): void {
      if (!entry.interactionId) {
        return
      }

      processGroup(entry)

      const existing = interactions.get(entry.interactionId)
      if (existing === undefined || entry.duration > existing.duration) {
        interactions.set(entry.interactionId, {
          duration: entry.duration,
          startTime: entry.startTime,
          target: entry.target,
          interactionId: entry.interactionId,
        })
        updateTopInteractions()
      }
    },

    get(): InteractionToNextPaint | undefined {
      if (topInteractions.length === 0) {
        return undefined
      }

      const n = topInteractions.length
      const index = Math.max(0, Math.min(Math.floor(n - 1 - n * 0.02), n - 1))
      const interaction = topInteractions[index]

      const result: InteractionToNextPaint = { value: interaction.duration, time: interaction.startTime }
      const tagName = interaction.target?.tagName
      if (tagName) {
        result.targetSelector = tagName.toLowerCase()
      }
      result.subParts = computeSubParts(interaction.interactionId, interaction.duration)
      return result
    },
  }
}
