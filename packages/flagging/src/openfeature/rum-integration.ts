// Define an interface for RUM integration
interface RumIntegration {
    trackFeatureFlag(flagKey: string, value: any): void;
    trackExposure(params: {
        flagKey: string;
        allocationKey?: string;
        exposureKey: string;
        subjectKey?: string;
        subjectAttributes?: Record<string, any>;
        variantKey?: string;
        metadata?: Record<string, any>;
    }): void;
}
export interface DDRum {
    addFeatureFlagEvaluation: (flagKey: string, value: any) => void;
    addAction: (actionName: string, params: Record<string, any>) => void;
}

export const newDatadogRumIntegration = (datadogRum: DDRum): RumIntegration => {
    return {
        trackFeatureFlag: (flagKey: string, value: any) => {
            datadogRum.addFeatureFlagEvaluation(flagKey, value)
        },
        trackExposure(params) {
            datadogRum.addAction('__dd_exposure', {
              timestamp: 0,
              flag_key: params.flagKey,
              allocation_key: params.allocationKey,
              exposure_key: params.exposureKey,
              subject_key: params.subjectKey,
              subject_attributes: params.subjectAttributes,
              variant_key: params.variantKey,
              metadata: params.metadata
            });
          }
    }
}