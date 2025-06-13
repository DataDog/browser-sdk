export interface DDRum {
    addFeatureFlagEvaluation: (flagKey: string, value: any) => void;
    addAction: (actionName: string, params: Record<string, any>) => void;
}
