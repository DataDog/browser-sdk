const ROOT_TAG = document.querySelector('html')
const RUM_SDK_ON = 'rum-sdk-on'

console.log('Looking for the Datadog RUM SDK ...')
const checkForRumInterval = setInterval(() => {
    if(window['DD_RUM']) {
        ROOT_TAG.dispatchEvent(new CustomEvent(RUM_SDK_ON, {}))
        clearInterval(checkForRumInterval)
    } else {
        console.log('keep looking ...')
    }
}, 1000)