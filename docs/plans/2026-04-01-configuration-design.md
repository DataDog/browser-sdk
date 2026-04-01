# Configuration Design

## Context

`core-next` needs a configuration system that is:

- Generic — no knowledge of RUM, Logs, or other modules
- Extensible — modules add their own config fields without touching `core-next`
- Type-safe — TypeScript catches invalid init configs at the call site
- Singleton — assembled once at init time, readable by any component

## Design

### Base init interface (`core-next`)

`SdkInitConfiguration` must be an `interface` (not a `type` alias) to support module augmentation:

```ts
interface SdkInitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean // default: true. false = collect but don't send
  sessionSampleRate?: number // default: 100
  env?: string
  service?: string
  version?: string
}
```

### Base assembled config (`core-next`)

The validated, normalized version with all defaults applied:

```ts
interface SdkConfiguration {
  clientToken: string
  site: string
  enabled: boolean
  sessionSampleRate: number
  env?: string
  service?: string
  version?: string
}
```

### Module augmentation

Each module extends `SdkInitConfiguration` via TypeScript module augmentation. The import is the activation signal — importing the module adds its fields to the type:

```ts
// In @datadog/rum-next:
declare module '@datadog/core-next' {
  interface SdkInitConfiguration {
    rum?: RumInitConfiguration
  }
}
```

See `ARCHITECTURE_V8.md` for the full rationale.

### ConfigExtension

Each module provides a `ConfigExtension` that owns its validation and normalization:

```ts
interface ConfigExtension<TKey extends string, TInit, TConfig> {
  key: TKey
  validate(init: TInit | undefined): TConfig | null // null = invalid, abort init
}
```

### buildConfiguration

Validates base fields and runs each registered extension:

```ts
function buildConfiguration(
  init: SdkInitConfiguration,
  extensions: ConfigExtension<string, unknown, unknown>[]
): SdkConfiguration | null
```

Returns `null` if base validation or any extension returns `null`.

### ConfigReader (singleton)

A typed reader created after a successful init. Components reach for it — they never hold a direct reference to the config object:

```ts
interface ConfigReader<TConfig extends SdkConfiguration = SdkConfiguration> {
  get(): TConfig
}

function createConfigReader<TConfig extends SdkConfiguration>(config: TConfig): ConfigReader<TConfig>
```

## Data flow

```
sdk.init(userConfig)
  → buildConfiguration(userConfig, [rumExtension, logsExtension, ...])
      → validate base fields → SdkConfiguration
      → rumExtension.validate(userConfig.rum) → RumConfiguration | null
      → logsExtension.validate(userConfig.logs) → LogsConfiguration | null
      → merge all slices
  → createConfigReader(assembledConfig)
  → singleton stored, components call reader.get()
```

## What is not in scope

- Module loading mechanism (code split vs remote — open decision)
- Validation error messages / display (owned by each module)
- Config serialization for telemetry (separate concern)
