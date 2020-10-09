import { declareTest, TestRunner } from './declareTest'
import { DEFAULT_SETUPS, LogsSetupOptions, RumSetupOptions, SetupFactory, SetupOptions } from './setups'

const DEFAULT_RUM_OPTIONS = {
  applicationId: 'appId',
  clientToken: 'token',
}

const DEFAULT_LOGS_OPTIONS = {
  applicationId: 'appId',
  clientToken: 'token',
}

export function createTest(title: string) {
  return new TestBuilder(title)
}

class TestBuilder {
  private rumOptions: RumSetupOptions | undefined = undefined
  private logsOptions: LogsSetupOptions | undefined = undefined
  private head: string = ''
  private body: string = ''
  private setups: Array<{ factory: SetupFactory; name?: string }> = []

  constructor(private title: string) {}

  withRum(rumOptions?: RumSetupOptions) {
    this.rumOptions = { ...DEFAULT_RUM_OPTIONS, ...rumOptions }
    return this
  }

  withLogs(logsOptions?: LogsSetupOptions) {
    this.logsOptions = { ...DEFAULT_LOGS_OPTIONS, ...logsOptions }
    return this
  }

  withHead(head: string) {
    this.head = head
    return this
  }

  withBody(body: string) {
    this.body = body
    return this
  }

  withSetup(factory: SetupFactory, name?: string) {
    this.setups.push({ factory, name })
    if (this.setups.length > 1 && this.setups.some((item) => !item.name)) {
      throw new Error('Tests with multiple setups need to give a name to each setups')
    }
    return this
  }

  run(runner: TestRunner) {
    const setups = this.setups.length ? this.setups : DEFAULT_SETUPS

    const setupOptions: SetupOptions = {
      body: this.body,
      head: this.head,
      logs: this.logsOptions,
      rum: this.rumOptions,
    }

    if (setups.length > 1) {
      describe(this.title, () => {
        for (const { name, factory } of setups) {
          declareTest(name!, factory(setupOptions), runner)
        }
      })
    } else {
      declareTest(this.title, setups[0].factory(setupOptions), runner)
    }
  }
}
