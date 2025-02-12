import type { ProfilerSample } from '../types';

import { getNumberOfSamples } from './getNumberOfSamples';

describe('getNumberOfSamples', () => {
    it('returns 0 for empty array', () => {
        const samples: ProfilerSample[] = [];
        const result = getNumberOfSamples(samples);
        expect(result).toBe(0);
    });

    it('returns 0 for array with samples without stackId', () => {
        const samples: ProfilerSample[] = [
            { stackId: undefined, timestamp: 0 },
            { stackId: undefined, timestamp: 1 },
        ];
        const result = getNumberOfSamples(samples);
        expect(result).toBe(0);
    });

    it('returns 1 for array with one sample with stackId', () => {
        const samples: ProfilerSample[] = [{ stackId: 1, timestamp: 0 }];
        const result = getNumberOfSamples(samples);
        expect(result).toBe(1);
    });

    it('returns 2 for array with two samples with stackId', () => {
        const samples: ProfilerSample[] = [
            { stackId: 1, timestamp: 0 },
            { stackId: undefined, timestamp: 1 },
            { stackId: 2, timestamp: 2 },
        ];
        const result = getNumberOfSamples(samples);
        expect(result).toBe(2);
    });
});
