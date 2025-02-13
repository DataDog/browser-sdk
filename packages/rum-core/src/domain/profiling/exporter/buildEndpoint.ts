import { generateUUID } from '@datadog/browser-core';


export type TrackType = 'profile';

export function buildEndpoint(
    site: string,
    clientToken: string,
    trackType: TrackType,
    configurationTags: string[],
    transport: 'beacon' | 'fetch',
) {
    const path = `/api/v2/${trackType}`;
    const host = buildEndpointHost(site);
    const parameters = buildEndpointParameters(
        clientToken,
        configurationTags,
        transport,
    );

    return `https://${host}${path}?${parameters}`;
}

function buildEndpointHost(site: string) {
    const domainParts = site.split('.');
    const extension = domainParts.pop();
    return `browser-intake-${domainParts.join('-')}.${extension!}`;
}

function buildEndpointParameters(
    clientToken: string,
    configurationTags: string[],
    transport: 'beacon' | 'fetch',
) {
    const tags = [`api:${transport}`].concat(configurationTags);

    const parameters = [
        'ddsource=browser',
        `ddtags=${encodeURIComponent(tags.join(','))}`,
        `dd-api-key=${clientToken}`,
        'dd-evp-origin=browser',
        `dd-request-id=${generateUUID()}`,
    ];

    return parameters.join('&');
}
