import { addExperimentalFeatures, type Duration, type RelativeTime, type ServerDuration } from '@datadog/browser-core'
import { ExperimentalFeature } from '@datadog/browser-core'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { createPerformanceEntry } from '../../../test'
import {
  MAX_RESOURCE_VALUE_CHAR_LENGTH,
  computeResourceEntryDetails,
  computeResourceEntryDuration,
  computeResourceEntryType,
  isAllowedRequestUrl,
  sanitizeIfLongDataUrl,
} from './resourceUtils'

// Timing values for a resource entry with valid, measurable timings for all detail fields
const resourceWithDetailsOverrides = {
  connectEnd: 17 as RelativeTime,
  connectStart: 15 as RelativeTime,
  domainLookupEnd: 14 as RelativeTime,
  domainLookupStart: 13 as RelativeTime,
  fetchStart: 12 as RelativeTime,
  redirectEnd: 11 as RelativeTime,
  redirectStart: 10 as RelativeTime,
  requestStart: 20 as RelativeTime,
  responseEnd: 60 as RelativeTime,
  responseStart: 50 as RelativeTime,
  secureConnectionStart: 16 as RelativeTime,
  startTime: 10 as RelativeTime,
  workerStart: 0 as RelativeTime,
}

describe('computeResourceEntryType', () => {
  ;[
    {
      description: 'file extension with query params',
      expected: 'js',
      name: 'http://localhost/test.js?from=foo.css',
    },
    {
      description: 'css extension',
      expected: 'css',
      name: 'http://localhost/test.css',
    },
    {
      description: 'image initiator',
      expected: 'image',
      initiatorType: 'img',
      name: 'http://localhost/test',
    },
    {
      description: 'image extension',
      expected: 'image',
      name: 'http://localhost/test.jpg',
    },
  ].forEach(
    ({
      description,
      name,
      initiatorType,
      expected,
    }: {
      description: string
      name: string
      initiatorType?: string
      expected: string
    }) => {
      it(`should compute resource kind: ${description}`, () => {
        const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { initiatorType, name })
        expect(computeResourceEntryType(entry)).toEqual(expected)
      })
    }
  )
})

describe('computeResourceEntryDetails', () => {
  it('should not compute entry without detailed timings', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          connectEnd: 0 as RelativeTime,
          connectStart: 0 as RelativeTime,
          domainLookupEnd: 0 as RelativeTime,
          domainLookupStart: 0 as RelativeTime,
          redirectEnd: 0 as RelativeTime,
          redirectStart: 0 as RelativeTime,
          requestStart: 0 as RelativeTime,
          responseStart: 0 as RelativeTime,
          secureConnectionStart: 0 as RelativeTime,
        })
      )
    ).toBeUndefined()
  })

  it('should compute details from entry', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, resourceWithDetailsOverrides)
      )
    ).toEqual({
      connect: { start: 5e6 as ServerDuration, duration: 2e6 as ServerDuration },
      dns: { start: 3e6 as ServerDuration, duration: 1e6 as ServerDuration },
      download: { start: 40e6 as ServerDuration, duration: 10e6 as ServerDuration },
      first_byte: { start: 10e6 as ServerDuration, duration: 30e6 as ServerDuration },
      redirect: { start: 0 as ServerDuration, duration: 1e6 as ServerDuration },
      ssl: { start: 6e6 as ServerDuration, duration: 1e6 as ServerDuration },
    })
  })

  it('should compute worker timing when workerStart < fetchStart', () => {
    const entry = createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
      ...resourceWithDetailsOverrides,
      workerStart: 11 as RelativeTime,
      fetchStart: 12 as RelativeTime,
    })
    const details = computeResourceEntryDetails(entry)
    expect(details!.worker).toEqual({ start: 1e6 as ServerDuration, duration: 1e6 as ServerDuration })
  })

  it('should not compute redirect timing when no redirect', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          ...resourceWithDetailsOverrides,
          fetchStart: 10 as RelativeTime,
          redirectEnd: 0 as RelativeTime,
          redirectStart: 0 as RelativeTime,
        })
      )
    ).toEqual({
      connect: { start: 5e6 as ServerDuration, duration: 2e6 as ServerDuration },
      dns: { start: 3e6 as ServerDuration, duration: 1e6 as ServerDuration },
      download: { start: 40e6 as ServerDuration, duration: 10e6 as ServerDuration },
      first_byte: { start: 10e6 as ServerDuration, duration: 30e6 as ServerDuration },
      ssl: { start: 6e6 as ServerDuration, duration: 1e6 as ServerDuration },
    })
  })

  it('should not compute dns timing when persistent connection or cache', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          ...resourceWithDetailsOverrides,
          domainLookupEnd: 12 as RelativeTime,
          domainLookupStart: 12 as RelativeTime,
          fetchStart: 12 as RelativeTime,
        })
      )
    ).toEqual({
      connect: { start: 5e6 as ServerDuration, duration: 2e6 as ServerDuration },
      download: { start: 40e6 as ServerDuration, duration: 10e6 as ServerDuration },
      first_byte: { start: 10e6 as ServerDuration, duration: 30e6 as ServerDuration },
      redirect: { start: 0 as ServerDuration, duration: 1e6 as ServerDuration },
      ssl: { start: 6e6 as ServerDuration, duration: 1e6 as ServerDuration },
    })
  })

  it('should not compute ssl timing when no secure connection', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          ...resourceWithDetailsOverrides,
          secureConnectionStart: 0 as RelativeTime,
        })
      )
    ).toEqual({
      connect: { start: 5e6 as ServerDuration, duration: 2e6 as ServerDuration },
      dns: { start: 3e6 as ServerDuration, duration: 1e6 as ServerDuration },
      download: { start: 40e6 as ServerDuration, duration: 10e6 as ServerDuration },
      first_byte: { start: 10e6 as ServerDuration, duration: 30e6 as ServerDuration },
      redirect: { start: 0 as ServerDuration, duration: 1e6 as ServerDuration },
    })
  })

  it('should not compute ssl timing when persistent connection', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          ...resourceWithDetailsOverrides,
          connectEnd: 12 as RelativeTime,
          connectStart: 12 as RelativeTime,
          domainLookupEnd: 12 as RelativeTime,
          domainLookupStart: 12 as RelativeTime,
          fetchStart: 12 as RelativeTime,
          secureConnectionStart: 12 as RelativeTime,
        })
      )
    ).toEqual({
      download: { start: 40e6 as ServerDuration, duration: 10e6 as ServerDuration },
      first_byte: { start: 10e6 as ServerDuration, duration: 30e6 as ServerDuration },
      redirect: { start: 0 as ServerDuration, duration: 1e6 as ServerDuration },
    })
  })

  it('should not compute connect timing when persistent connection', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          ...resourceWithDetailsOverrides,
          connectEnd: 12 as RelativeTime,
          connectStart: 12 as RelativeTime,
          domainLookupEnd: 12 as RelativeTime,
          domainLookupStart: 12 as RelativeTime,
          fetchStart: 12 as RelativeTime,
          secureConnectionStart: 0 as RelativeTime,
        })
      )
    ).toEqual({
      download: { start: 40e6 as ServerDuration, duration: 10e6 as ServerDuration },
      first_byte: { start: 10e6 as ServerDuration, duration: 30e6 as ServerDuration },
      redirect: { start: 0 as ServerDuration, duration: 1e6 as ServerDuration },
    })
  })
  ;[
    {
      reason: 'connectStart > connectEnd',
      connectEnd: 10 as RelativeTime,
      connectStart: 20 as RelativeTime,
    },
    {
      reason: 'domainLookupStart > domainLookupEnd',
      domainLookupEnd: 10 as RelativeTime,
      domainLookupStart: 20 as RelativeTime,
    },
    {
      reason: 'responseStart > responseEnd',
      responseEnd: 10 as RelativeTime,
      responseStart: 20 as RelativeTime,
    },
    {
      reason: 'requestStart > responseStart',
      requestStart: 20 as RelativeTime,
      responseStart: 10 as RelativeTime,
    },
    {
      reason: 'redirectStart > redirectEnd',
      redirectEnd: 15 as RelativeTime,
      redirectStart: 20 as RelativeTime,
    },
    {
      connectEnd: 10 as RelativeTime,
      reason: 'secureConnectionStart > connectEnd',
      secureConnectionStart: 20 as RelativeTime,
    },
    {
      connectEnd: 10 as RelativeTime,
      connectStart: -3 as RelativeTime,
      fetchStart: 10 as RelativeTime,
      reason: 'negative timing start',
    },
  ].forEach(({ reason, ...overrides }) => {
    it(`should not compute entry when ${reason}`, () => {
      expect(
        computeResourceEntryDetails(
          createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { ...resourceWithDetailsOverrides, ...overrides })
        )
      ).toBeUndefined()
    })
  })

  it('should allow really fast document resource', () => {
    expect(
      computeResourceEntryDetails(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          connectEnd: 10 as RelativeTime,
          connectStart: 10 as RelativeTime,
          domainLookupEnd: 10 as RelativeTime,
          domainLookupStart: 10 as RelativeTime,
          fetchStart: 10 as RelativeTime,
          redirectEnd: 0 as RelativeTime,
          redirectStart: 0 as RelativeTime,
          requestStart: 10 as RelativeTime,
          responseEnd: 50 as RelativeTime,
          responseStart: 40 as RelativeTime,
          secureConnectionStart: 0 as RelativeTime,
          startTime: 10 as RelativeTime,
        })
      )
    ).toEqual({
      download: { start: 30e6 as ServerDuration, duration: 10e6 as ServerDuration },
      first_byte: { start: 0 as ServerDuration, duration: 30e6 as ServerDuration },
    })
  })
})

describe('computeResourceEntryDuration', () => {
  it('should return the entry duration', () => {
    expect(computeResourceEntryDuration(createPerformanceEntry(RumPerformanceEntryType.RESOURCE))).toBe(100 as Duration)
  })

  it('should use other available timing if the duration is 0', () => {
    expect(
      computeResourceEntryDuration(
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { duration: 0 as Duration })
      )
    ).toBe(100 as Duration)
  })
})

describe('shouldTrackResource', () => {
  const intakeParameters = 'ddsource=browser&dd-api-key=xxxx&dd-request-id=1234567890'
  it('should exclude requests on intakes endpoints', () => {
    expect(isAllowedRequestUrl(`https://rum-intake.com/v1/input/abcde?${intakeParameters}`)).toBe(false)
  })

  it('should allow requests on intake endpoints when TRACK_INTAKE_REQUESTS is enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.TRACK_INTAKE_REQUESTS])
    expect(isAllowedRequestUrl(`https://rum-intake.com/v1/input/abcde?${intakeParameters}`)).toBe(true)
  })

  it('should exclude requests on intakes endpoints with different client parameters', () => {
    expect(isAllowedRequestUrl(`https://rum-intake.com/v1/input/wxyz?${intakeParameters}`)).toBe(false)
  })

  it('should allow requests on non intake domains', () => {
    expect(isAllowedRequestUrl('https://my-domain.com/hello?a=b')).toBe(true)
  })
})

describe('sanitizeIfLongDataUrl', () => {
  const longString = new Array(MAX_RESOURCE_VALUE_CHAR_LENGTH).join('a')
  it('returns truncated url when detects data url of json', () => {
    expect(sanitizeIfLongDataUrl(`data:text/json; charset=utf-8,${longString}`)).toEqual(
      'data:text/json; charset=utf-8,[...]'
    )
  })

  it('returns truncated url when detects data url of html', () => {
    const longDataUrl = `data:text/html,${longString}`
    expect(sanitizeIfLongDataUrl(longDataUrl)).toEqual('data:text/html,[...]')
  })

  it('returns truncated url when detects data url of image', () => {
    const longDataUrl = `data:image/svg+xml;base64,${longString}`
    expect(sanitizeIfLongDataUrl(longDataUrl)).toEqual('data:image/svg+xml;base64,[...]')
  })

  it('returns truncated url when detects plain data url', () => {
    const plainDataUrl = `data:,${longString}`
    expect(sanitizeIfLongDataUrl(plainDataUrl)).toEqual('data:,[...]')
  })

  it('allows customized length limit', () => {
    const customLength = MAX_RESOURCE_VALUE_CHAR_LENGTH + 100
    const longDataUrl = `data:text/plain,${longString}`
    expect(sanitizeIfLongDataUrl(longDataUrl, customLength)).toEqual(longDataUrl)
  })

  it('returns truncated url when detects data url with exotic mime type', () => {
    const exoticTypeDataUrl = `data:application/vnd.openxmlformats;fileName=officedocument.presentationxml;base64,${longString}`
    expect(sanitizeIfLongDataUrl(exoticTypeDataUrl)).toEqual(
      'data:application/vnd.openxmlformats;fileName=officedocument.presentationxml;base64,[...]'
    )
  })

  it('returns the original url when the data url is within limit', () => {
    const shortDataUrl = `data:text/plain,${new Array(MAX_RESOURCE_VALUE_CHAR_LENGTH - 15).join('a')}`
    expect(sanitizeIfLongDataUrl(shortDataUrl)).toEqual(shortDataUrl)
  })

  it('returns original string when no data url found', () => {
    const normalUrl = 'https://example.com/resource.js'
    expect(sanitizeIfLongDataUrl(normalUrl)).toEqual(normalUrl)
  })

  it('returns original string when data type match not found', () => {
    const dataTypeTooLongUrl = `data:${new Array(100).join('a')},${longString}`
    expect(sanitizeIfLongDataUrl(dataTypeTooLongUrl)).toEqual(dataTypeTooLongUrl)
  })
})
