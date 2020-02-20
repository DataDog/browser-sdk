import { computePerformanceResourceDetails } from '../src/resourceUtils'

function generateResourceWith(overrides: Partial<PerformanceResourceTiming>) {
  const completeTiming: Partial<PerformanceResourceTiming> = {
    connectEnd: 17,
    connectStart: 15,
    domainLookupEnd: 14,
    domainLookupStart: 13,
    duration: 50,
    entryType: 'resource',
    fetchStart: 12,
    name: 'entry',
    redirectEnd: 11,
    redirectStart: 10,
    requestStart: 20,
    responseEnd: 60,
    responseStart: 50,
    secureConnectionStart: 16,
    startTime: 10,
    ...overrides,
  }
  return completeTiming as PerformanceResourceTiming
}

describe('computePerformanceResourceDetails', () => {
  it('should not compute entry without detailed timings', () => {
    expect(
      computePerformanceResourceDetails(
        generateResourceWith({
          connectEnd: 0,
          connectStart: 0,
          domainLookupEnd: 0,
          domainLookupStart: 0,
          redirectEnd: 0,
          redirectStart: 0,
          requestStart: 0,
          responseStart: 0,
          secureConnectionStart: 0,
        })
      )
    ).toBeUndefined()
  })

  it('should compute timings from entry', () => {
    expect(computePerformanceResourceDetails(generateResourceWith({}))).toEqual({
      connect: { start: 15e6, duration: 2e6 },
      dns: { start: 13e6, duration: 1e6 },
      download: { start: 50e6, duration: 10e6 },
      firstByte: { start: 20e6, duration: 30e6 },
      redirect: { start: 10e6, duration: 1e6 },
      ssl: { start: 16e6, duration: 1e6 },
    })
  })

  it('should not compute optional timings', () => {
    expect(
      computePerformanceResourceDetails(
        generateResourceWith({
          redirectStart: 0,
          secureConnectionStart: 0,
        })
      )
    ).toEqual({
      connect: { start: 15e6, duration: 2e6 },
      dns: { start: 13e6, duration: 1e6 },
      download: { start: 50e6, duration: 10e6 },
      firstByte: { start: 20e6, duration: 30e6 },
      redirect: undefined,
      ssl: undefined,
    })
  })
  ;[
    {
      connectEnd: 10,
      connectStart: 20,
      reason: 'connectStart > connectEnd',
    },
    {
      domainLookupEnd: 10,
      domainLookupStart: 20,
      reason: 'domainLookupStart > domainLookupEnd',
    },
    {
      reason: 'responseStart > responseEnd',
      responseEnd: 10,
      responseStart: 20,
    },
    {
      reason: 'requestStart > responseStart',
      requestStart: 20,
      responseStart: 10,
    },
    {
      reason: 'redirectStart > redirectEnd',
      redirectEnd: 10,
      redirectStart: 20,
    },
    {
      connectEnd: 10,
      reason: 'secureConnectionStart > connectEnd',
      secureConnectionStart: 20,
    },
  ].forEach(({ reason, ...overrides }) => {
    it(`should not compute entry when ${reason}`, () => {
      expect(computePerformanceResourceDetails(generateResourceWith(overrides))).toBeUndefined()
    })
  })
})

it('should allow really fast document resource', () => {
  expect(
    computePerformanceResourceDetails(
      generateResourceWith({
        connectEnd: 0,
        connectStart: 0,
        domainLookupEnd: 0,
        domainLookupStart: 0,
        redirectEnd: 0,
        redirectStart: 0,
        requestStart: 0,
        responseEnd: 50,
        responseStart: 40,
        secureConnectionStart: 0,
      })
    )
  ).toEqual({
    connect: { start: 0, duration: 0 },
    dns: { start: 0, duration: 0 },
    download: { start: 40e6, duration: 10e6 },
    firstByte: { start: 0, duration: 40e6 },
    redirect: undefined,
    ssl: undefined,
  })
})
