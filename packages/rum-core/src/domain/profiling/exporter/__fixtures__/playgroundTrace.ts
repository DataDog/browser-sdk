export const trace = {
  frames: [
    { name: 'Profiler' },
    { column: 37, line: 19, name: '', resourceId: 0 },
    { column: 8, line: 169, name: 'start', resourceId: 0 },
    { column: 1, line: 1, name: '', resourceId: 1 },
    { column: 19, line: 10, name: 'functionD', resourceId: 2 },
    { column: 19, line: 7, name: 'functionC', resourceId: 2 },
    { column: 19, line: 4, name: 'functionB', resourceId: 2 },
    { column: 19, line: 1, name: 'functionA', resourceId: 2 },
  ],
  resources: [
    'http://localhost:5173/@fs/Users/dev/rum-profiler-poc/src/rumProfiler.ts',
    'http://localhost:5173/main.tsx',
    'http://localhost:5173/computeHeavyThings.ts',
  ],
  stacks: [
    { frameId: 3 },
    { frameId: 2, parentId: 0 },
    { frameId: 1, parentId: 1 },
    { frameId: 0, parentId: 2 },
    { frameId: 7 },
    { frameId: 6, parentId: 4 },
    { frameId: 5, parentId: 5 },
    { frameId: 4, parentId: 6 },
  ],
  samples: [
    {
      timestamp: 0,
      stackId: 3,
    },
    {
      timestamp: 1,
      stackId: 3,
    },
    {
      timestamp: 2,
      stackId: 3,
    },
    {
      timestamp: 3,
    },
    { timestamp: 4 },
    { timestamp: 5, stackId: 7 },
    { timestamp: 6, stackId: 7 },
    { timestamp: 7, stackId: 7 },
    { timestamp: 8, stackId: 7 },
    { timestamp: 9, stackId: 6 },
    { timestamp: 10, stackId: 6 },
    { timestamp: 11, stackId: 5 },
    { timestamp: 12 },
  ],
  startTime: 0,
  endTime: 12,
  timeOrigin: 1000000000000,
  sampleInterval: 10,
  navigation: [
    {
      startTime: 0,
      endTime: 12,
      name: '/',
    },
  ],
  events: [
    {
      name: 'pointerup',
      entryType: 'event',
      startTime: 4,
      duration: 1,
      processingStart: 4,
      processingEnd: 5,
      cancelable: true,
    },
  ],
  measures: [
    {
      name: 'heavy',
      entryType: 'measure',
      startTime: 6,
      duration: 3,
    },
  ],
  longTasks: [
    {
      name: 'self',
      entryType: 'longtask',
      startTime: 5,
      duration: 6,
      attribution: [
        {
          name: 'unknown',
          entryType: 'taskattribution',
          startTime: 0,
          duration: 0,
          containerType: 'window',
          containerSrc: '',
          containerId: '',
          containerName: '',
        },
      ],
    },
  ],
}
