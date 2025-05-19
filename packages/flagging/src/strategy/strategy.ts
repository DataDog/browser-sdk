export interface Strategy {
    initialize(): Promise<void>
    getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean;
    getIntegerAssignment(flagKey: string, defaultValue: number): number;
    getNumericAssignment(flagKey: string, defaultValue: number): number;
    getStringAssignment(flagKey: string, defaultValue: string): string;
    getObjectAssignment<T extends Record<string, unknown>>(flagKey: string, defaultValue: T): T;
}

export default Strategy;
