import type { RelativeTime } from '@datadog/browser-core'
// Note: we are using parts of rum-core in the tests
import { createRumSessionManagerMock } from '../../../rum-core/test/mockRumSessionManager'
import { setup } from '../../../rum-core/test/specHelper'
import type { TestSetupBuilder } from '../../../rum-core/test/specHelper'

import type { LogsSessionManager } from './logsSessionManager'
import { startInternalContext } from './internalContext'

describe('internal context', () => {
  let setupBuilder: TestSetupBuilder
  let findSessionSpy: jasmine.Spy<LogsSessionManager['findTrackedSession']>
  let internalContext: ReturnType<typeof startInternalContext>

  beforeEach(() => {
    setupBuilder = setup()
      .withSessionManager(createRumSessionManagerMock().setId('456'))
      .beforeBuild(({ sessionManager }) => {
        findSessionSpy = spyOn(sessionManager, 'findTrackedSession').and.callThrough()
        internalContext = startInternalContext(sessionManager)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it("should return undefined if the session isn't tracked", () => {
    setupBuilder.withSessionManager(createRumSessionManagerMock().setNotTracked()).build()
    expect(internalContext.get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    setupBuilder.build()
    internalContext.get(123)
    expect(findSessionSpy).toHaveBeenCalledWith(123 as RelativeTime)
  })
})
