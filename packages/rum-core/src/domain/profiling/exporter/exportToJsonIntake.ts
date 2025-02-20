
import { sendXHR, type EndpointBuilder, type HttpResponse, type InitConfiguration, type Payload} from '@datadog/browser-core';
import type {
    RumProfilerTraceExporter,
    RumProfilerTrace,
} from '../types';
import { getLongTaskId } from '../utils/longTaskRegistry';

interface ProfileEventAttributes {
    application: { id: string };
    session?: { id: string };
    view?: { ids: string[] };
    context?: { profile_long_task_id: string[] };
}
interface ProfileEvent extends ProfileEventAttributes{
    attachments: string[];
    start: string // ISO date
    end:  string // ISO date
    family: 'chrome';
    tags_profiler: string;
}

/**
 * Exports RUM profile as JSON to public profiling intake.
 */
export const exportToJSONIntake: RumProfilerTraceExporter = (
    profilerTrace,
    endpointBuilder,
    applicationId,
    sessionId,
    site
) => {
    const event = createProfileEvent(profilerTrace, endpointBuilder, applicationId, sessionId, site);
    const payload = createProfilePayload(profilerTrace, event)

    // Sends profile to public profiling intake.
    const xhrUrl = endpointBuilder.build('xhr', payload)

    // Send everything.
    return new Promise<HttpResponse>((resolve) => sendXHR(xhrUrl, payload.data, resolve));
};

function createProfileEvent(
    profilerTrace: RumProfilerTrace, 
    endpointBuilder: EndpointBuilder, 
    applicationId: string ,
    sessionId: string | undefined,
    site: string |undefined
): ProfileEvent {
    const rawParameters = endpointBuilder.rawParameters;
    const profileAttributes = extractProfileEventAttributes(profilerTrace, applicationId, sessionId);
    const profileEventTags = extractProfileEventTags(rawParameters.configurationTags, rawParameters.initConfiguration, site)

    const start = new Date(profilerTrace.timeOrigin + profilerTrace.startTime)
    const end = new Date(profilerTrace.timeOrigin + profilerTrace.endTime)
    
    const profileEvent: ProfileEvent = {
        ...profileAttributes,
        attachments: ['wall-time.json'],
        start: start.toISOString(),
        end: end.toISOString(),
        family: 'chrome',
        tags_profiler: profileEventTags.join(','),
    };

    return profileEvent;
}

function extractProfileEventTags(configurationTags: string[], initConfiguration: InitConfiguration, site: string | undefined): string[] {

    const profileEventTags = configurationTags.concat([
        `service:${initConfiguration.service}`,
        `version:${initConfiguration.version}`,
        `env:${initConfiguration.env || 'unknown'}`,
        'language:javascript',
        'runtime:chrome',
        'family:chrome',
        'format:json',
        // TODO: replace with RUM device id in the future
        `host:${site}`,
    ]);

    return profileEventTags;
}

function createProfilePayload (profilerTrace:RumProfilerTrace, profileEvent: ProfileEvent ) : Payload {
    const profilerTraceBlob = new Blob([JSON.stringify(profilerTrace)], {
        type: 'application/json',
    });
    const formData = new FormData();
    formData.append(
        'event',
        new Blob([JSON.stringify(profileEvent)], { type: 'application/json' }),
        'event.json',
    );
    formData.append('wall-time.json', profilerTraceBlob, 'wall-time.json');

    return { data:formData, retry:undefined, encoding:undefined, bytesCount:0};
}

/**
 * Extract additional attributes from the trace.
 * @param trace Profiler trace
 * @param applicationId application id.
 * @param sessionId session id.
 * @returns Additional attributes
 */
function extractProfileEventAttributes(
    profilerTrace: RumProfilerTrace,
    applicationId: string,
    sessionId: string |undefined
): ProfileEventAttributes {
    const attributes: ProfileEventAttributes = {
        application: {
            id: applicationId,
        },
    };
    if (sessionId) {
        attributes.session = {
            id: sessionId,
        };
    }
    const viewIds = Array.from(
        new Set(profilerTrace.navigation.map((entry) => entry.viewId)),
    );
    if (viewIds.length) {
        attributes.view = {
            ids: viewIds,
        };
    }
    const longTaskIds: string[] = profilerTrace.longTasks.map((longTask) =>
        getLongTaskId(longTask),
    ).filter((id) => id !== undefined);

    if (longTaskIds.length) {
        attributes.context = {
            profile_long_task_id: longTaskIds,
        };
    }
    return attributes;
}
