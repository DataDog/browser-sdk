export const trace = {
    frames: [
        {
            column: 1,
            line: 1,
            name: 'write',
            resourceId: 0,
        },
        {
            column: 1,
            line: 2,
            name: 'read',
            resourceId: 0,
        },
    ],
    resources: ['https://static.my-app.com/main.js'],
    samples: [
        {
            timestamp: 0,
            stackId: 0,
        },
        {
            timestamp: 1,
        },
    ],
    stacks: [
        {
            frameId: 0,
            parentId: 1,
        },
        {
            frameId: 1,
        },
    ],
    startTime: 0,
    endTime: 1,
    timeOrigin: 1000000000000,
    sampleInterval: 10,
    navigation: [],
    events: [],
    measures: [],
    longTasks: [],
};
