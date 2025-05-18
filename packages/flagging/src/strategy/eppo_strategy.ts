import Strategy from "./strategy";

export class EppoStrategy implements Strategy {
    getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean {
        return defaultValue;
    }

    getNumericAssignment(flagKey: string, defaultValue: number): number {
        return defaultValue;
    }

    getStringAssignment(flagKey: string, defaultValue: string): string {
        return defaultValue;
    }

    getObjectAssignment<T extends Record<string, unknown>>(flagKey: string, defaultValue: T): T {
        return defaultValue;
    }
}