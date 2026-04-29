import type { Session } from '../session/session'
import type { Enricher } from './factory'
import { DISCARD } from './factory'

interface SessionData {
  session: { id: string; type: 'user' }
}

function sessionEnricher(session: Session): Enricher<Record<string, unknown>, Record<string, unknown> & SessionData> {
  return {
    name: 'session',
    transform(data) {
      const id = session.getId()
      if (!id) {
        return DISCARD
      }
      return { ...data, session: { id, type: 'user' as const } }
    },
  }
}

export { sessionEnricher }
export type { SessionData }
