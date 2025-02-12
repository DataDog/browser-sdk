import type { Payload} from 'packages/core/src/transport/httpRequest';
import { sendXHR } from 'packages/core/src/transport/httpRequest';
import type { EndpointBuilder, InitConfiguration } from '@datadog/browser-core';
import type {
    RumProfilerTraceExporter,
    RumProfilerTrace,
} from '../types';
import { getLongTaskId } from '../utils/longTaskRegistry';

import { getEmptyPprofBlob } from './emptyPprof';

interface ProfileEventAttributes {
    application: { id: string };
    session?: { id: string };
    view?: { name: string[] };
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
) => {
    const event = createProfileEvent(profilerTrace, endpointBuilder, applicationId, sessionId);
    const payload = createProfilePayload(profilerTrace, event)

    // Sends profile to public profiling intake.
    const xhrUrl = endpointBuilder.build('xhr', payload)

    // Send everything.
    return new Promise((resolve) =>  sendXHR(xhrUrl, payload.data, resolve));
};

function createProfileEvent(
    profilerTrace: RumProfilerTrace, 
    endpointBuilder: EndpointBuilder, 
    applicationId: string ,
    sessionId: string | undefined
): ProfileEvent {
    const rawParameters = endpointBuilder.rawParameters;
    const profileAttributes = extractProfileEventAttributes(profilerTrace, applicationId, sessionId);
    const profileEventTags = extractProfileEventTags(rawParameters.configurationTags, rawParameters.initConfiguration)

    const start = new Date(profilerTrace.timeOrigin + profilerTrace.startTime)
    const end = new Date(profilerTrace.timeOrigin + profilerTrace.endTime)
    
    const profileEvent: ProfileEvent = {
        ...profileAttributes,
        attachments: ['wall-time.pprof', 'wall-time.json'],
        start: start.toISOString(),
        end: end.toISOString(),
        family: 'chrome',
        tags_profiler: profileEventTags.join(','),
    };

    return profileEvent;
}

function extractProfileEventTags(configurationTags: string[], initConfiguration: InitConfiguration): string[] {

    const profileEventTags = configurationTags.concat([
        `service:${initConfiguration.service}`,
        `version:${initConfiguration.version}`,
        `env:${initConfiguration.env || 'unknown'}`,
        'language:javascript',
        'runtime:chrome',
        'family:chrome',
        'format:json',
        // TODO: replace with RUM device id in the future
        `host:${normalizeTag(navigator.userAgent).slice(0, 200)}`,
    ]);

    // TODO deobfuscation is not supported yet
    // if (config.commitHash) {
    //     eventTags.push(`git.commit.sha:${config.commitHash}`);
    // }
    // if (config.repositoryUrl) {
    //     eventTags.push(`git.repository_url:${config.repositoryUrl}`);
    // }

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

    // Temporary workaround. Alongside the JSON with actual data, we always send an empty PPROF file, until our system is fully compatible with JSON.
    formData.append('wall-time.pprof', getEmptyPprofBlob(), 'wall-time.pprof');

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
    const viewNames = Array.from(
        new Set(profilerTrace.navigation.map((entry) => entry.name)),
    );
    if (viewNames.length) {
        attributes.view = {
            name: viewNames,
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

/**
 * Replaces unsupported characters with underscores.
 * @param tag Tag value to normalize
 * @returns Normalized tag value
 */
function normalizeTag(tag: string): string {
    return tag
        .replace(/[^a-zA-Z0-9_\-:./]/g, '_')
        .replace(/__/g, '_')
        .toLowerCase();
}
