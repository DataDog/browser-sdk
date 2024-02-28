/**
 * https://opentelemetry.io/docs/specs/otel/metrics
 *
 * ```
 * +------------------+
 * | MeterProvider    |                 +-----------------+             +--------------+
 * |   Meter A        | Measurements... |                 | Metrics...  |              |
 * |     Instrument X +-----------------> In-memory state +-------------> MetricReader |
 * |     Instrument Y |                 |                 |             |              |
 * |   Meter B        |                 +-----------------+             +--------------+
 * |     Instrument Z |
 * |     ...          |                 +-----------------+             +--------------+
 * |     ...          | Measurements... |                 | Metrics...  |              |
 * |     ...          +-----------------> In-memory state +-------------> MetricReader |
 * |     ...          |                 |                 |             |              |
 * |     ...          |                 +-----------------+             +--------------+
 * ```
 *
 * ```
 * +-----------------+            +---------------------------------+
 * |                 | Metrics... |                                 |
 * | In-memory state +------------> Periodic exporting MetricReader |
 * |                 |            |                                 |
 * +-----------------+            |    +-----------------------+    |
 *                                |    |                       |    |
 *                                |    | MetricExporter (push) +-------> Another process
 *                                |    |                       |    |
 *                                |    +-----------------------+    |
 *                                |                                 |
 *                                +---------------------------------+
 * ```
 *
 * ```
 * +-- MeterProvider(default)
 *     |
 *     +-- Meter(name='io.opentelemetry.runtime', version='1.0.0')
 *     |   |
 *     |   +-- Instrument<Asynchronous Gauge, int>(name='cpython.gc', attributes=['generation'], unit='kB')
 *     |   |
 *     |   +-- instruments...
 *     |
 *     +-- Meter(name='io.opentelemetry.contrib.mongodb.client', version='2.3.0')
 *         |
 *         +-- Instrument<Counter, int>(name='client.exception', attributes=['type'], unit='1')
 *         |
 *         +-- Instrument<Histogram, double>(name='client.duration', attributes=['server.address', 'server.port'], unit='ms')
 *         |
 *         +-- instruments...
 *
 * +-- MeterProvider(custom)
 *     |
 *     +-- Meter(name='bank.payment', version='23.3.5')
 *         |
 *         +-- instruments...
 * ```
 */
import type { ClocksState, TimeStamp } from '@datadog/browser-core'
import { ONE_SECOND, timeStampNow, clocksNow, setInterval, clearInterval } from '@datadog/browser-core'

interface MetricProviderOptions {
  readers?: MetricReader[]
}

export class MeterProvider {
  private meterByName: Map<string, Meter>
  private readers: MetricReader[]
  private storage: Storage

  constructor(options?: MetricProviderOptions) {
    this.meterByName = new Map()
    this.readers = options?.readers || []
    this.storage = []
    this.readers.forEach((reader) => this.configureReader(reader))
  }

  getMeter(name: string) {
    let meter = this.meterByName.get(name)
    if (meter === undefined) {
      meter = new Meter(this.storage)
      this.meterByName.set(name, meter)
    }
    return meter
  }

  private configureReader(reader: MetricReader) {
    const storage = this.storage
    reader.setProducer({
      collect() {
        const copy = storage.slice()
        storage.length = 0
        return copy
      },
    })
  }
}

type Instrument = any
interface Measurement {
  name: string
  value: number
  date: ClocksState
  type: InstrumentType
}
type Storage = Measurement[]
const enum InstrumentType {
  Counter = 'Counter',
}

export class Meter {
  private instrumentByName: Map<string, Instrument>

  constructor(private storage: Storage) {
    this.instrumentByName = new Map()
  }

  createCounter(name: string) {
    let counter = this.instrumentByName.get(name)
    if (counter === undefined) {
      counter = new CounterInstrument(this.storage, name)
      this.instrumentByName.set(name, counter)
    }
    return counter
  }
}

export class CounterInstrument {
  constructor(
    private storage: Storage,
    private name: string
  ) {}

  add(value: number) {
    this.storage.push({ value, type: InstrumentType.Counter, date: clocksNow(), name: this.name })
  }
}

interface MetricProducer {
  collect(): Measurement[]
}

export abstract class MetricReader {
  // @ts-ignore setter exists
  protected producer: MetricProducer

  setProducer(producer: MetricProducer) {
    this.producer = producer
  }
}

export class PeriodicMetricReader extends MetricReader {
  private timer: number

  constructor(
    interval: number,
    private exporter: PushMetricExporter
  ) {
    super()
    this.timer = setInterval(() => {
      this.collect()
    }, interval)
  }

  collect() {
    const measurements = this.producer.collect()
    const endTime = timeStampNow()
    const metricByName = new Map<string, MetricData>()
    measurements.forEach((measurement) => {
      const { name, value, date } = measurement
      const startTime = date.timeStamp
      const metric = metricByName.get(name)
      if (metric === undefined) {
        metricByName.set(name, { name, points: [{ startTime, endTime, value }] })
      } else {
        const aggregation = metric.points[0]
        aggregation.value += value
        aggregation.startTime = Math.min(aggregation.startTime, startTime) as TimeStamp
      }
    })
    const metrics: MetricData[] = []
    metricByName.forEach((metric) => metrics.push(metric))
    if (metrics.length > 0) {
      this.exporter.export(metrics)
    }
  }

  stop() {
    clearInterval(this.timer)
  }
}

export interface PushMetricExporter {
  export(metrics: MetricData[]): void
}

export interface MetricData {
  name: string
  points: MetricPoint[]
}

export interface MetricPoint {
  startTime: TimeStamp
  endTime: TimeStamp
  value: number
}
