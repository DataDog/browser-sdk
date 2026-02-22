export type ClientMessage =
  | { type: 'jasmine-started'; data: jasmine.JasmineStartedInfo }
  | { type: 'suite-started'; data: jasmine.SuiteResult }
  | { type: 'spec-started'; data: jasmine.SpecResult }
  | { type: 'spec-done'; data: jasmine.SpecResult }
  | { type: 'suite-done'; data: jasmine.SuiteResult }
  | { type: 'jasmine-done'; data: jasmine.JasmineDoneInfo }

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ServerMessage = {
  type: 'run-tests'
  data: TestRunOptions
}

export interface TestRunOptions {
  seed?: string
  stopOnFailure?: boolean
}
