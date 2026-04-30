interface PageStateEntry {
  state: 'active' | 'passive' | 'hidden' | 'frozen' | 'terminated'
  start: number
}

function mapVisibilityState(state: DocumentVisibilityState): PageStateEntry['state'] {
  return state === 'visible' ? 'active' : 'passive'
}

function pageStateEnricher() {
  const states: PageStateEntry[] = []
  let startTime = 0

  if (typeof document !== 'undefined') {
    // Record initial state
    states.push({ state: mapVisibilityState(document.visibilityState), start: 0 })

    // Track transitions
    document.addEventListener('visibilitychange', () => {
      states.push({
        state: mapVisibilityState(document.visibilityState),
        start: Math.round(performance.now() - startTime),
      })
    })

    // Track freeze/resume (Page Lifecycle API)
    document.addEventListener('freeze', () => {
      states.push({ state: 'frozen', start: Math.round(performance.now() - startTime) })
    })
    document.addEventListener('resume', () => {
      states.push({ state: 'active', start: Math.round(performance.now() - startTime) })
    })
  }

  return {
    name: 'pageState',
    transform(data: Record<string, unknown>) {
      return {
        ...data,
        _dd: {
          ...((data._dd as Record<string, unknown>) || {}),
          page_states: states.length > 0 ? [...states] : undefined,
        },
      }
    },
    // Allow resetting the start time (e.g., on new view)
    resetStartTime(time: number) {
      startTime = time
    },
  }
}

export { pageStateEnricher }
export type { PageStateEntry }
