import {
    Hook,
    Provider,
    ProviderEvents,
} from '@openfeature/web-sdk'
import {
    EvaluationContext,
    ResolutionDetails,
    Logger,
    JsonValue,
    ProviderEventEmitter,
    AnyProviderEvent,
    StandardResolutionReasons
} from '@openfeature/core'
import Strategy from '../strategy/strategy';
import { EppoStrategy } from '../strategy/eppo_strategy';

class DatadogProvider implements Provider {
    // Adds runtime validation that the provider is used with the expected SDK
    public readonly runsOn = 'client';
    readonly metadata = {
        name: 'datadog-provider',
    } as const;

    private strategy: Strategy = new EppoStrategy();

    // Optional provider managed hooks
    hooks?: Hook[];

    resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, logger: Logger): ResolutionDetails<boolean> {
        return {
            value: this.strategy.getBooleanAssignment(flagKey, defaultValue),
            reason: StandardResolutionReasons.DEFAULT,
        }
    }

    resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext, logger: Logger): ResolutionDetails<string> {
        return {
            value: this.strategy.getStringAssignment(flagKey, defaultValue),
            reason: StandardResolutionReasons.DEFAULT,
        }
    }

    resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext, logger: Logger): ResolutionDetails<number> {
        return {
            value: this.strategy.getNumericAssignment(flagKey, defaultValue),
            reason: StandardResolutionReasons.DEFAULT,
        }
    }

    resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext, logger: Logger): ResolutionDetails<T> {
        return {
            value: this.strategy.getObjectAssignment(flagKey, defaultValue as Record<string, unknown>) as T,
            reason: StandardResolutionReasons.DEFAULT,
        }
    }

    onContextChange?(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
        // reconcile the provider's cached flags, if applicable
        return Promise.resolve();
    }

    // implement with "new OpenFeatureEventEmitter()", and use "emit()" to emit events
    events?: ProviderEventEmitter<AnyProviderEvent> | undefined;

    initialize?(context?: EvaluationContext | undefined): Promise<void> {
        return Promise.resolve();
    }

    onClose?(): Promise<void> {
        // code to shut down your provider
        return Promise.resolve();
    }
}
