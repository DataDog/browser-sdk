;(() => {
  // @ts-expect-error - DD_LIVE_DEBUGGER does exist
  if (!window.DD_LIVE_DEBUGGER) {
    console.error('DD_LIVE_DEBUGGER is not available. Make sure the live debugger SDK is loaded.')
    return
  }

  // @ts-expect-error - DD_LIVE_DEBUGGER does exist
  window.DD_LIVE_DEBUGGER.init()

  // TODO: Remove hardcoded probes once dynamic probe management is implemented
  // Method log probe with snapshot on entry and return, evaluated at entry
  window.DD_LIVE_DEBUGGER.addProbe({
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8c',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'probes-go-here.js', methodName: 'sometimesThrows' },
    template: 'Calling probes-go-here.js.sometimesThrows with a={a}, b={b}',
    segments: [
      { str: 'Calling probes-go-here.js.sometimesThrows with a=' },
      { dsl: 'a', json: { ref: 'a' } },
      { str: ', b=' },
      { dsl: 'b', json: { ref: 'b' } },
    ],
    captureSnapshot: true,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 1 },
    evaluateAt: 'ENTRY',
  })

  // Method log probe with snapshot on entry and return, evaluated at exit
  window.DD_LIVE_DEBUGGER.addProbe({
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8d',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'probes-go-here.js', methodName: 'withLocals' },
    template: 'Executed probes-go-here.js.withLocals, it took {@duration}ms',
    segments: [
      { str: 'Executed probes-go-here.js.withLocals, it took ' },
      { dsl: '@duration', json: { ref: '@duration' } },
      { str: 'ms' },
    ],
    captureSnapshot: true,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 1 },
    evaluateAt: 'EXIT',
  })

  // Method log probe without snapshot, evaluated at exit
  window.DD_LIVE_DEBUGGER.addProbe({
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8e',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'probes-go-here.js', methodName: 'noLocals' },
    template: 'Executed probes-go-here.js.noLocals, it took {@duration}ms',
    segments: [
      { str: 'Executed probes-go-here.js.noLocals, it took ' },
      { dsl: '@duration', json: { ref: '@duration' } },
      { str: 'ms' },
    ],
    captureSnapshot: false,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 5000 },
    evaluateAt: 'EXIT',
  })

  // Method log probe with condition - only fires if duration > 100ms
  window.DD_LIVE_DEBUGGER.addProbe({
    id: 'd692ee6d-5734-4df7-9d86-e3bc6449cc8f',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'probes-go-here.js', methodName: 'sometimesSlow' },
    when: {
      dsl: '@duration > 100',
      json: { gt: [{ ref: '@duration' }, 100] },
    },
    template: 'Slow execution detected: {@duration}ms',
    segments: [{ str: 'Slow execution detected: ' }, { dsl: '@duration', json: { ref: '@duration' } }, { str: 'ms' }],
    captureSnapshot: true,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 1 },
    evaluateAt: 'EXIT',
  })
})()
