import { ExperimentalFeature, isExperimentalFeatureEnabled,performDraw } from '@datadog/browser-core';
import type { RumSessionManager } from '@datadog/browser-rum-core';
import type { RumConfiguration } from '../configuration';
import type { LifeCycle} from '../lifeCycle';
import type { createRumProfiler as CreateRumProfilerType } from './profiler';
import { lazyLoadProfiler } from './lazyLoadProfiler';

const DUMMY_STOP = { stop: () => { /* Nothing to stop */ } };

export const startProfilingCollection = (
    configuration: RumConfiguration, 
    lifeCycle: LifeCycle,
    session: RumSessionManager,
    isLongAnimationFrameEnabled: boolean
) => {
    if (!isExperimentalFeatureEnabled(ExperimentalFeature.PROFILING_FEATURE)) {
        // Profiling is not enabled.
        return DUMMY_STOP;
    }

    // TODO Deobfuscation / SCI
    // const { commitHash, repositoryUrl } = configuration;

    const sampleRate = configuration.profilingSampleRate;
    if (!performDraw(sampleRate)) {
        // User is not lucky, no profiling!
        return DUMMY_STOP;
    }
    
    const endpointBuilder = configuration.profilingEndpointBuilder;

    let profiler : ReturnType<typeof CreateRumProfilerType>;

    lazyLoadProfiler().then((createRumProfiler) => {
        if (!createRumProfiler) {
            return;
        }
        
        profiler = createRumProfiler({
            endpointBuilder,
            isLongAnimationFrameEnabled,
            lifeCycle,
            session,
        });

        profiler.start(configuration);


    }).catch(() => {
        // Nothing to really do if the profiler was not loaded properly.
    });

    return { stop: () => { profiler?.stop() }  };
};