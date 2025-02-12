/**
 * @param sampleRate Sample rate in percents (0-100)
 * @returns If we should sample
 */
export function shouldSample(sampleRate: number): boolean {
    if (sampleRate >= 100) {
        return true;
    }
    if (sampleRate <= 0) {
        return false;
    }

    return Math.random() <= sampleRate / 100;
}
