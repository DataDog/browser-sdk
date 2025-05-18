export interface Strategy {
    getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean;
    getNumericAssignment(flagKey: string, defaultValue: number): number;
    getStringAssignment(flagKey: string, defaultValue: string): string;
    getObjectAssignment<T extends Record<string, unknown>>(flagKey: string, defaultValue: T): T;
}

export default Strategy;
