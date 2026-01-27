# Live Debugger Test Page

This test page demonstrates the Firebase Remote Config integration with the Datadog RUM SDK's live debugger feature.

## Setup

### Option 1: Using Real Firebase Remote Config

1. **Create a Firebase Project** (if you don't have one):
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use an existing one
   - Get your Firebase config from Project Settings

2. **Configure Firebase Remote Config**:
   - In Firebase Console, go to Remote Config
   - Create a new parameter with a key (e.g., `test-live-debugger-id`)
   - Set the value type to **Boolean**
   - Set a default value (true or false)
   - Publish the configuration

3. **Update the Test Page**:
   - Open `live-debugger-test.html` in a browser
   - Paste your Firebase config JSON in the "Firebase Config" field
   - Set the "Live Debugger ID" to match your Firebase Remote Config parameter key
   - Configure your Datadog credentials
   - Click "Initialize SDKs"

### Option 2: Using Mock Firebase (For Testing Without Real Firebase)

The test page includes a mock Firebase Remote Config implementation that uses localStorage for testing:

1. **Start the Dev Server**:
   ```bash
   yarn dev
   ```

2. **Open the Test Page**:
   - Navigate to `http://localhost:8080/live-debugger-test.html`
   - Leave the Firebase config as-is (it will use mock Firebase)
   - Set your Live Debugger ID (e.g., `test-live-debugger-id`)
   - Configure your Datadog credentials
   - Click "Initialize SDKs"

3. **Test Value Changes**:
   - Click "Set Mock Firebase Value (Toggle)" to change the value
   - Watch the "Global Context Property" update automatically
   - Check the logs to see log events being sent

## Features

The test page provides:

1. **Configuration Form**: Set up Firebase and Datadog credentials
2. **Status Display**: Shows initialization status
3. **Global Context Display**: Shows the `dd_<id>` property value in real-time
4. **Actions**:
   - Send Test Log Event: Test the `sendLiveDebuggerLog` API
   - Fetch Firebase Config: Manually trigger a Firebase Remote Config fetch
   - Set Mock Firebase Value: Toggle mock Firebase value (when using mock)
   - Refresh Context: Manually refresh the global context display
   - Check Firebase Value: Check the current Firebase Remote Config value
5. **Logs**: Real-time log of all operations and events

## Testing Scenarios

### Test 1: Initial Value
1. Initialize SDKs
2. Check that the global context property `dd_<liveDebuggerId>` is set
3. Verify the value matches Firebase Remote Config default value

### Test 2: Value Changes
1. Initialize SDKs
2. Change the Firebase Remote Config value in Firebase Console (or use mock toggle)
3. Wait for Firebase to fetch updates (or manually click "Fetch Firebase Config")
4. Verify the global context property updates automatically
5. Check logs for log events being sent

### Test 3: Log Events
1. Initialize SDKs (make sure Logs SDK is initialized)
2. Click "Send Test Log Event"
3. Check Datadog Logs Explorer for the log event

### Test 4: Error Handling
1. Try initializing without Firebase SDK loaded
2. Try initializing with invalid Firebase config
3. Verify error messages are displayed

## Expected Behavior

When working correctly:

1. **On Initialization**:
   - Firebase Remote Config is initialized
   - RUM SDK reads the initial value from Firebase Remote Config
   - Global context property `dd_<liveDebuggerId>` is set to the boolean value
   - A log event is sent with the initial value

2. **On Value Change**:
   - Firebase Remote Config `onConfigUpdated` callback fires
   - Global context property is updated
   - A new log event is sent with the updated value

3. **Global Context**:
   - Property key format: `dd_<liveDebuggerId>`
   - Property value: boolean (true/false)
   - Accessible via `DD_RUM.getGlobalContext()`

## Troubleshooting

### Firebase SDK Not Found
- Make sure Firebase SDK scripts are loaded before initializing RUM SDK
- Check browser console for errors

### Global Context Property Not Set
- Verify `allowLiveDebugger` is set to `true` in RUM init
- Verify `liveDebuggerId` matches Firebase Remote Config parameter key
- Check browser console for errors

### Log Events Not Sent
- Make sure Datadog Logs SDK is initialized
- Check that `DD_LOGS` is available in the browser console
- Verify logs are being sent to Datadog (check Logs Explorer)

### Value Not Updating
- Firebase Remote Config has a minimum fetch interval (default: 1 hour)
- Use "Fetch Firebase Config" button to manually trigger a fetch
- For testing, the mock Firebase updates every 2 seconds

## Notes

- The test page uses Firebase SDK v10.7.1 (compat version)
- For production use, ensure Firebase Remote Config is properly configured
- The mock Firebase implementation is for testing only and uses localStorage
- Real Firebase Remote Config requires proper authentication and project setup


