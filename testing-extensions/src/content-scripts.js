import { datadogRum } from '@datadog/browser-rum';

console.log('Content script loaded. Initializing extension RUM...');

// State for tracking intercepted events
let isInterceptionActive = true;
let interceptedEventCount = 0;
let lastInterceptedEventType = 'None';

// Initialize the extension's RUM instance
datadogRum.init({
    applicationId: 'bd3472ea-efc2-45e1-8dff-be4cea9429b3',
    clientToken: 'pub7216f8a2d1091e263c95c1205882474e',
    site: 'datad0g.com',
    service: 'extension-rum-interceptor',
    env: 'dev',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: 'mask-user-input',
});

// Set a user for the extension's RUM
datadogRum.setUser({
    id: 'extension-user',
    name: 'Extension User',
    email: 'extension@example.com'
});

console.log('[Extension] RUM initialized successfully');

// Enable debug mode for our extension
if (typeof datadogRum._setDebugMode === 'function') {
    datadogRum._setDebugMode(true);
    console.log('[Extension] Debug mode enabled for RUM');
}

// Start session replay recording for the extension's RUM
datadogRum.startSessionReplayRecording();

// Inject a script into the page to override the page's RUM
const injectScript = () => {
    if (!isInterceptionActive) {
        console.log('[Extension] RUM interception is disabled');
        return;
    }
    
    console.log('[Extension] Injecting RUM override script');
    
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            console.log('[Page] RUM override script injected');
            
            // Set the extension override flag
            window._DATADOG_EXTENSION_OVERRIDE = true;
            
            // Store original DD_RUM if it exists
            const originalDDRUM = window.DD_RUM;
            
            // Create a proxy for window.DD_RUM
            const rumProxy = new Proxy({}, {
                get: function(target, prop) {
                    console.log('[Page] Intercepted DD_RUM.' + prop + ' call');
                    
                    // Special handling for init to capture the configuration
                    if (prop === 'init') {
                        return function(config) {
                            console.log('[Page] Intercepted RUM init with config:', JSON.stringify(config));
                            // We don't call the original init, effectively preventing the page's RUM from initializing
                            
                            // Dispatch an event to notify the content script about the intercepted config
                            window.dispatchEvent(new CustomEvent('extension_rum_init_intercepted', {
                                detail: { config }
                            }));
                            
                            return true; // Pretend initialization succeeded
                        };
                    }
                    
                    // For all other methods, create a function that logs the call and forwards to extension
                    return function(...args) {
                        console.log('[Page] Intercepted RUM.' + prop + ' call with args:', JSON.stringify(args));
                        
                        // Dispatch an event to notify the content script about the intercepted method call
                        window.dispatchEvent(new CustomEvent('extension_rum_method_called', {
                            detail: { method: prop, args }
                        }));
                        
                        // Return a dummy value or promise to prevent errors
                        if (typeof originalDDRUM === 'object' && typeof originalDDRUM[prop] === 'function') {
                            // Try to mimic the return type of the original method
                            const originalReturn = originalDDRUM[prop];
                            if (originalReturn && originalReturn.then) {
                                return Promise.resolve();
                            }
                        }
                        return undefined;
                    };
                }
            });
            
            // Override window.DD_RUM
            window.DD_RUM = rumProxy;
            
            // Also override datadogRum if it's exposed globally
            if (window.datadogRum) {
                window.datadogRum = rumProxy;
            }
            
            // Handle any global datadog initialization function
            const originalDDInit = window.DD_LOGS && window.DD_LOGS.init;
            if (originalDDInit) {
                window.DD_LOGS.init = function(...args) {
                    console.log('[Page] Intercepted DD_LOGS.init call');
                    // Don't call the original init
                    return true;
                };
            }
            
            console.log('[Page] RUM override complete');
        })();
    `;
    
    // Inject the script at document_start
    document.documentElement.prepend(script);
    
    // Remove the script element after execution
    script.remove();
};

// Listen for events from the injected script
window.addEventListener('extension_rum_init_intercepted', (event) => {
    console.log('[Extension] Received intercepted RUM init:', event.detail.config);
    
    // Track the event
    interceptedEventCount++;
    lastInterceptedEventType = 'init';
    
    // You could update the extension's RUM with the page's configuration if desired
    // For example, you might want to use the page's service name or environment
    datadogRum.setGlobalContextProperty('original_config', event.detail.config);
});

window.addEventListener('extension_rum_method_called', (event) => {
    const { method, args } = event.detail;
    console.log(`[Extension] Received intercepted RUM method: ${method}`);
    
    // Track the event
    interceptedEventCount++;
    lastInterceptedEventType = method;
    
    // Forward the method call to the extension's RUM instance
    try {
        if (typeof datadogRum[method] === 'function') {
            datadogRum[method](...args);
        }
    } catch (error) {
        console.error(`[Extension] Error forwarding method ${method}:`, error);
    }
});

// Handle messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Extension] Received message from popup:', message);
    
    if (message.action === 'getState') {
        // Send the current state to the popup
        sendResponse({
            success: true,
            isActive: isInterceptionActive,
            eventCount: interceptedEventCount,
            lastEventType: lastInterceptedEventType
        });
    } else if (message.action === 'toggleInterception') {
        // Toggle the interception state
        isInterceptionActive = !isInterceptionActive;
        
        if (isInterceptionActive) {
            // Re-inject the script if interception is enabled
            injectScript();
        }
        
        sendResponse({
            success: true,
            isActive: isInterceptionActive
        });
    } else if (message.action === 'getSessionReplayLink') {
        // Get the session replay link
        const replayLink = datadogRum.getSessionReplayLink();
        
        sendResponse({
            success: true,
            link: replayLink
        });
    }
    
    // Return true to indicate that the response will be sent asynchronously
    return true;
});

// Execute the injection as soon as possible
injectScript();

// In case the page is already loaded, we need to make sure our script runs first
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Extension] DOM loaded, ensuring RUM override');
        injectScript(); // Inject again to be safe
    });
} else {
    console.log('[Extension] DOM already loaded, ensuring RUM override');
    injectScript(); // Inject again to be safe
}
