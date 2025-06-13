# Flagging SDK (Prerelease)

This package supports flagging and experimentation by performing evaluation in the browser.

## Initialize

```typescript
import { DatadogProvider } from '@datadog/openfeature-provider'

const datadogFlaggingProvider = new DatadogProvider()

// provide the subject
const subject = {
  targetingKey: 'subject-key-1',
}
await OpenFeature.setContext(subject)

// initialize
await OpenFeature.setProviderAndWait(datadogFlaggingProvider)
```

## Evaluation

```typescript
const client = OpenFeature.getClient()

// provide the flag key and a default value which is returned for exceptional conditions.
const flagEval = client.getBooleanValue('<FLAG_KEY>', false)
```

## Integration with RUM feature flag tracking

```typescript
// Initialize RUM with experimental feature flags tracking
import { datadogRum } from '@datadog/browser-rum';
import { createDatadogRumIntegration } from '@datadog/openfeature-provider';

// Initialize Datadog Browser SDK
datadogRum.init({
  ...
  enableExperimentalFeatures: ["feature_flags"],
  ...
});

// Create the RUM integration
const rumIntegration = createDatadogRumIntegration();

// Add OpenFeature hook
OpenFeature.addHooks({
  after(_hookContext: HookContext, details: EvaluationDetails<FlagValue>) {
    rumIntegration.trackFeatureFlag(details.flagKey, details.value)
  }
})
```

The RUM integration is handled through a factory function that returns an object conforming to the `RumIntegration` interface. This provides better abstraction and testability while maintaining a simple functional approach.
