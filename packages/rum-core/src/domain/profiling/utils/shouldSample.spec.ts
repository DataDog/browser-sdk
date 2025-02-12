import { shouldSample } from './shouldSample';

describe('shouldSample', () => {
    it('always returns true for 100', () => {
        for (let i = 0; i < 1e3; i++) {
            expect(shouldSample(100)).toBe(true);
        }
    });

    it('always returns false for 0', () => {
        for (let i = 0; i < 1e3; i++) {
            expect(shouldSample(0)).toBe(false);
        }
    });

    it('returns true 30% of the time for 30', () => {
        let trueCount = 0;
        for (let i = 0; i < 1e6; i++) {
            if (shouldSample(30)) {
                trueCount++;
            }
        }
        expect(trueCount).toBeGreaterThan(1e5);
        expect(trueCount).toBeLessThan(5e5);
    });
});
