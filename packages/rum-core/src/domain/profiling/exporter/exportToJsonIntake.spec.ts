import type { EndpointBuilder, InitConfiguration } from '@datadog/browser-core';
import { fakeInitConfig } from '../test-utils/fakeConfig';
import { mockFetch } from '../test-utils/mockFetch';
import { mockSendBeacon } from '../test-utils/mockSendBeacon';
import { mockUserAgent } from '../test-utils/mockUserAgent';
import type { RumProfilerTrace } from '../types';
import {
    disableLongTaskRegistry,
    enableLongTaskRegistry,
} from '../utils/longTaskRegistry';

import { trace as playgroundTrace } from './__fixtures__/playground-trace';
import { trace as zeroIndexTrace } from './__fixtures__/zero-index-trace';
import { exportToJSONIntake } from './exportToJsonIntake';

const UUID_PATTERN =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('exportToJSONIntake', () => {
    const { extractIntakeUrlAndFormDataFromSendBeacon } = mockSendBeacon(false);
    const { extractIntakeUrlAndFormDataFromFetch } = mockFetch();
    mockUserAgent();
    const endpointBuilder: EndpointBuilder = {
        build: () => new URL('https://example.com').href,
        rawParameters: {
            configurationTags: [],
            initConfiguration: fakeInitConfig as InitConfiguration,
        },
        trackType: 'profile',
        urlPrefix: 'https://example.com',
    }

    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2001-09-09T01:46:40.000Z'));

    beforeEach(() => enableLongTaskRegistry());
    afterEach(() => disableLongTaskRegistry());

    it('exports a playground trace', async () => {
        await exportToJSONIntake(
            playgroundTrace as unknown as RumProfilerTrace,
            endpointBuilder,
            'my-application-id',
            'my-session-id',
        );

        const { intakeUrl: intakeUrlFromFetch, formData: formDataFromFetch } =
            extractIntakeUrlAndFormDataFromFetch();

        // Fetch URL
        expect(intakeUrlFromFetch.protocol).toBe('https:');
        expect(intakeUrlFromFetch.hostname).toBe('browser-intake-datad0g.com');
        expect(intakeUrlFromFetch.pathname).toBe('/api/v2/profile');
        expect(intakeUrlFromFetch.hash).toBe('');
        expect(intakeUrlFromFetch.searchParams.get('ddsource')).toBe('browser');
        expect(intakeUrlFromFetch.searchParams.get('ddtags')).toBe('api:fetch');
        expect(intakeUrlFromFetch.searchParams.get('dd-api-key')).toBe(
            'my-client-token',
        );
        expect(intakeUrlFromFetch.searchParams.get('dd-evp-origin')).toBe(
            'browser',
        );
        expect(intakeUrlFromFetch.searchParams.get('dd-request-id')).toMatch(
            UUID_PATTERN,
        );

        // As they are the same, simplify the rest of the test
        const formData = formDataFromFetch;

        const eventBlob = formData.get('event') as Blob;
        expect(eventBlob).toBeDefined();
        expect(eventBlob.type).toBe('application/json');
        expect(eventBlob.size).toBeGreaterThan(0);
        expect(JSON.parse(await eventBlob.text())).toEqual({
            attachments: ['wall-time.pprof', 'wall-time.json'],
            start: '2001-09-09T01:46:40.000Z',
            end: '2001-09-09T01:46:40.012Z',
            family: 'chrome',
            tags_profiler: [
                'service:my-service',
                'version:my-version',
                'env:my-env',
                'language:javascript',
                'runtime:chrome',
                'family:chrome',
                'format:json',
                'host:mozilla/5.0_macintosh_intel_mac_os_x_10_15_7_applewebkit/537.36_khtml_like_gecko_',
                // 'git.commit.sha:my-commit-hash',
                // 'git.repository_url:https://my-repository-url',
            ].join(','),
            application: {
                id: 'my-application-id',
            },
            view: {
                name: ['/'],
            },
            context: {
                profile_long_task_id: [jasmine.stringMatching(UUID_PATTERN)],
            },
        });

        const wallTimeBlob = formData.get('wall-time.json') as Blob;
        expect(wallTimeBlob).toBeDefined();
        expect(wallTimeBlob.type).toBe('application/json');
        expect(wallTimeBlob.size).toBeGreaterThan(0);

        // Resolve to the actual RumProfilerTrace object to make the test easier to read
        const profile: RumProfilerTrace = JSON.parse(await wallTimeBlob.text());
        expect(profile).toEqual(playgroundTrace as unknown as RumProfilerTrace);
    });

    it('exports trace with zero-index resource', async () => {
        await exportToJSONIntake(
            playgroundTrace as unknown as RumProfilerTrace,
            endpointBuilder,
            'my-application-id',
            'my-session-id',
        );

        const { formData } = extractIntakeUrlAndFormDataFromSendBeacon();

        const wallTimeBlob = formData.get('wall-time.json') as Blob;
        expect(wallTimeBlob).toBeDefined();
        expect(wallTimeBlob.type).toBe('application/json');
        expect(wallTimeBlob.size).toBeGreaterThan(0);

        // Resolve to the actual RumProfilerTrace object to make the test easier to read
        const profile: RumProfilerTrace = JSON.parse(await wallTimeBlob.text());
        expect(profile).toEqual(zeroIndexTrace);
    });
});
