export function collectAsyncCalls<F extends jasmine.Func>(spy: jasmine.Spy<F>) {
  return {
    waitAsyncCalls: (expectedCallsCount: number, callback: (calls: jasmine.Calls<F>) => void) => {
      if (spy.calls.count() === expectedCallsCount) {
        callback(spy.calls)
      } else if (spy.calls.count() > expectedCallsCount) {
        fail('Unexpected extra call')
      } else {
        spy.and.callFake((() => {
          if (spy.calls.count() === expectedCallsCount) {
            callback(spy.calls)
          }
        }) as F)
      }
    },
    expectNoExtraAsyncCall: (done: () => void) => {
      spy.and.callFake((() => {
        fail('Unexpected extra call')
      }) as F)
      setTimeout(done, 300)
    },
  }
}
