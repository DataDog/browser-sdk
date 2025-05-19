import EppoPrecomputedClient, { EppoPrecomputedClientOptions } from "./eppo/eppo-precomputed-client";
import Strategy from "./strategy";

export class EppoStrategy implements Strategy {
    private eppoClient: EppoPrecomputedClient | null;

    constructor(clientOptions: EppoPrecomputedClientOptions) {
        this.eppoClient = new EppoPrecomputedClient(clientOptions)
    }

    async initialize(): Promise<void> {
        return Promise.resolve();
    }

    getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean {
        return this.eppoClient?.getBooleanAssignment(flagKey, defaultValue) ?? defaultValue;
    }

    getNumericAssignment(flagKey: string, defaultValue: number): number {
        return this.eppoClient?.getNumericAssignment(flagKey, defaultValue) ?? defaultValue;
    }

    getIntegerAssignment(flagKey: string, defaultValue: number): number {
        return this.eppoClient?.getIntegerAssignment(flagKey, defaultValue) ?? defaultValue;
    }

    getStringAssignment(flagKey: string, defaultValue: string): string {
        return this.eppoClient?.getStringAssignment(flagKey, defaultValue) ?? defaultValue;
    }

    getObjectAssignment<T extends Record<string, unknown>>(flagKey: string, defaultValue: T): T {
        return (this.eppoClient?.getJSONAssignment(flagKey, defaultValue) as T) ?? defaultValue;
    }
}
