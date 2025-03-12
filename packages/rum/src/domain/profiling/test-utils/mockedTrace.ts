import type { ProfilerTrace } from '../types'

const generateFiftyRandomSamples = () => {
  const samples = []
  for (let i = 0; i < 50; i++) {
    samples.push({
      timestamp: i,
      stackId: i % 3,
    })
  }
  return samples
}

// eslint-disable-next-line local-rules/disallow-side-effects
const randomSamples = generateFiftyRandomSamples()

export const mockedEmptyTrace: ProfilerTrace = {
  resources: [],
  frames: [],
  stacks: [],
  samples: [],
}

export const mockedTrace: ProfilerTrace = {
  resources: ['resource1', 'resource2', 'resource3'],
  frames: [
    {
      name: 'frame-0',
      line: 1,
      column: 1,
      resourceId: 0,
    },
    {
      name: 'frame-1',
      line: 2,
      column: 2,
      resourceId: 1,
    },
    {
      name: 'frame-2',
      line: 3,
      column: 3,
      resourceId: 2,
    },
  ],
  stacks: [
    {
      frameId: 0,
    },
    {
      frameId: 1,
    },
    {
      frameId: 2,
    },
  ],
  samples: randomSamples,
}
