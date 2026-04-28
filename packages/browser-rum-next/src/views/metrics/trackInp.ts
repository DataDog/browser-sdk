import type { InteractionToNextPaint } from '../types'

interface InpEntry {
  duration: number
  startTime: number
  processingStart: number
  processingEnd: number
  target?: Element
  interactionId?: number
}

const MAX_INTERACTIONS = 10

export interface InpTracker {
  process(entry: InpEntry): void
  get(): InteractionToNextPaint | undefined
}

export function trackInp(): InpTracker {
  // Map from interactionId to max duration + target
  const interactions = new Map<number, { duration: number; target?: Element }>()
  // Sorted list of top interactions by duration (descending)
  let topInteractions: Array<{ duration: number; target?: Element }> = []

  function updateTopInteractions(): void {
    const all = Array.from(interactions.values()).sort((a, b) => b.duration - a.duration)
    topInteractions = all.slice(0, MAX_INTERACTIONS)
  }

  return {
    process(entry: InpEntry): void {
      if (!entry.interactionId) {
        return
      }

      const existing = interactions.get(entry.interactionId)
      if (existing === undefined || entry.duration > existing.duration) {
        interactions.set(entry.interactionId, {
          duration: entry.duration,
          target: entry.target,
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

      const result: InteractionToNextPaint = { value: interaction.duration }
      const tagName = interaction.target?.tagName
      if (tagName) {
        result.targetSelector = tagName.toLowerCase()
      }
      return result
    },
  }
}
