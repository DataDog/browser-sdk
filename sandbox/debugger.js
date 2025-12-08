;(() => {
  // @ts-expect-error - DD_LIVE_DEBUGGER does exist
  if (!window.DD_LIVE_DEBUGGER) {
    console.error('DD_LIVE_DEBUGGER is not available. Make sure the live debugger SDK is loaded.')
    return
  }

  // @ts-expect-error - DD_LIVE_DEBUGGER does exist
  window.DD_LIVE_DEBUGGER.init({
    service: 'poc-browser-live-debugger',
    env: 'watson-dev',
    version: `1.0.0-${crypto.randomUUID().slice(0, 8)}`,
    remoteConfigProxyUrl: 'http://localhost:3030'
  })

  // TODO: Remove hardcoded probes once dynamic probe management is implemented
  // Method log probe with snapshot on entry and return, evaluated at entry
  // window.DD_LIVE_DEBUGGER.addProbe({
  //   id: '72174a44-93ef-48b6-b1e4-33058941b6bf',
  //   version: 0,
  //   type: 'LOG_PROBE',
  //   where: { typeName: 'probes-go-here.js', methodName: 'sometimesThrows' },
  //   template: 'Calling probes-go-here.js.sometimesThrows with a={a}, b={b}',
  //   segments: [
  //     { str: 'Calling probes-go-here.js.sometimesThrows with a=' },
  //     { dsl: 'a', json: { ref: 'a' } },
  //     { str: ', b=' },
  //     { dsl: 'b', json: { ref: 'b' } },
  //   ],
  //   captureSnapshot: true,
  //   capture: { maxReferenceDepth: 3 },
  //   sampling: { snapshotsPerSecond: 1 },
  //   evaluateAt: 'ENTRY',
  // })

  // // Method log probe with snapshot on entry and return, evaluated at exit
  // window.DD_LIVE_DEBUGGER.addProbe({
  //   id: 'd2646fee-564d-4dec-820d-2c419cc86194',
  //   version: 0,
  //   type: 'LOG_PROBE',
  //   where: { typeName: 'probes-go-here.js', methodName: 'withLocals' },
  //   template: 'Executed probes-go-here.js.withLocals, it took {@duration}ms',
  //   segments: [
  //     { str: 'Executed probes-go-here.js.withLocals, it took ' },
  //     { dsl: '@duration', json: { ref: '@duration' } },
  //     { str: 'ms' },
  //   ],
  //   captureSnapshot: true,
  //   capture: { maxReferenceDepth: 3 },
  //   sampling: { snapshotsPerSecond: 1 },
  //   evaluateAt: 'EXIT',
  // })

  // // Method log probe without snapshot, evaluated at exit
  // window.DD_LIVE_DEBUGGER.addProbe({
  //   id: '26c27b15-1d58-4f5d-b1f1-2d40607fb431',
  //   version: 0,
  //   type: 'LOG_PROBE',
  //   where: { typeName: 'probes-go-here.js', methodName: 'noLocals' },
  //   template: 'Executed probes-go-here.js.noLocals, it took {@duration}ms',
  //   segments: [
  //     { str: 'Executed probes-go-here.js.noLocals, it took ' },
  //     { dsl: '@duration', json: { ref: '@duration' } },
  //     { str: 'ms' },
  //   ],
  //   captureSnapshot: false,
  //   capture: { maxReferenceDepth: 3 },
  //   sampling: { snapshotsPerSecond: 5000 },
  //   evaluateAt: 'EXIT',
  // })

  // // Method log probe with condition - only fires if duration > 100ms
  // window.DD_LIVE_DEBUGGER.addProbe({
  //   id: '80c7bbad-16c4-4518-a5f1-3582601b5aba',
  //   version: 0,
  //   type: 'LOG_PROBE',
  //   where: { typeName: 'probes-go-here.js', methodName: 'sometimesSlow' },
  //   when: {
  //     dsl: '@duration > 100',
  //     json: { gt: [{ ref: '@duration' }, 100] },
  //   },
  //   template: 'Slow execution detected: {@duration}ms',
  //   segments: [{ str: 'Slow execution detected: ' }, { dsl: '@duration', json: { ref: '@duration' } }, { str: 'ms' }],
  //   captureSnapshot: true,
  //   capture: { maxReferenceDepth: 3 },
  //   sampling: { snapshotsPerSecond: 1 },
  //   evaluateAt: 'EXIT',
  // })
})()
