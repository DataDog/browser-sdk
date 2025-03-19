// @ts-nocheck
import React from 'react'
import ReactDOM from 'react-dom'
import { datadogRum } from '@datadog/browser-rum'

export const domRender = (Component) => {
    datadogRum.init({
        applicationId: 'bd3472ea-efc2-45e1-8dff-be4cea9429b3',
        clientToken: 'pub7216f8a2d1091e263c95c1205882474e',
        site: 'datad0g.com',
        service: 'benoit-test',
        env: 'dev',
        sessionSampleRate: 100,
        sessionReplaySampleRate: 100,
        defaultPrivacyLevel: 'mask-user-input',
        sessionPersistence: 'local-storage'
    });

    datadogRum.startSessionReplayRecording();

    const root = document.getElementById('root');
    if (!root) {
        throw new Error('Root element not found');
    }
    
    ReactDOM.render(
        <React.StrictMode>
            <Component />
        </React.StrictMode>,
        root
    );
};