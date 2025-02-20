
export function mockFetch() {
    const originalFetch = globalThis.fetch;

    const fetchMock = jasmine.createSpy('fetchMock').and.callFake(
        (_input: RequestInfo | URL, _init?: RequestInit) =>
            Promise.resolve(new Response())
    );
    
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    afterEach(() => {
        fetchMock.calls.reset();
    });
    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    function extractIntakeUrlAndFormDataFromFetch(callIndex = 0) {
        const calls = fetchMock.calls.all();
        if (!calls[callIndex]) {
            throw new Error(`No fetch call found at index ${callIndex}`);
        }

        const [intakeUrl, request] = calls[callIndex] as unknown as [
            string,
            { body: FormData; method: string },
        ];

        return {
            // eslint-disable-next-line local-rules/disallow-url-constructor-patched-values
            intakeUrl: new URL(intakeUrl),
            formData: request.body,
            method: request.method,
        };
    }

    return { fetchMock, extractIntakeUrlAndFormDataFromFetch };
}
