
export const mockSendBeacon = (shouldSucceed = false) => {

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSendBeacon = globalThis.navigator.sendBeacon;

    const sendBeaconMock = jasmine.createSpy('fetchMock').and.callFake(
        (_intakeUrl: string, _body: FormData) => shouldSucceed,
    );
    navigator.sendBeacon = sendBeaconMock;

    afterEach(() => {
        sendBeaconMock.calls.reset();
    });
    afterAll(() => {
        navigator.sendBeacon = originalSendBeacon;
    });

    function extractIntakeUrlAndFormDataFromSendBeacon(callIndex = 0) {
        const calls = sendBeaconMock.calls.all();
        if (!calls[callIndex]) {
            throw new Error(`No sendBeacon call found at index ${callIndex}`);
        }

        const [intakeUrl, formData] = calls[callIndex] as unknown as [
            string,
            FormData,
        ];

        // eslint-disable-next-line local-rules/disallow-url-constructor-patched-values
        return { intakeUrl: new URL(intakeUrl), formData };
    }

    return { sendBeaconMock, extractIntakeUrlAndFormDataFromSendBeacon };
}
