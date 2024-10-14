import { mockClock, mockRequestIdleCallback, registerCleanupTask } from '../../test'
import { createTaskQueue, TIMED_OUT_TIME_REMAINING } from './taskQueue'

describe('createTaskQueue', () => {
  it('runs the task using an idle callback', () => {
    const requestIdleCallbackMock = mockRequestIdleCallback()
    const taskQueue = createTaskQueue()
    const task = jasmine.createSpy('task')

    taskQueue.push(task)
    expect(task).not.toHaveBeenCalled()

    requestIdleCallbackMock.idle()
    expect(task).toHaveBeenCalled()
  })

  it('runs as much task as possible in a single idle callback', () => {
    const clock = mockClock()
    registerCleanupTask(clock.cleanup)
    const requestIdleCallbackMock = mockRequestIdleCallback()

    // Each task takes 10ms to run
    const task1 = jasmine.createSpy().and.callFake(() => clock.tick(10))
    const task2 = jasmine.createSpy().and.callFake(() => clock.tick(10))
    const task3 = jasmine.createSpy().and.callFake(() => clock.tick(10))

    const taskQueue = createTaskQueue()

    taskQueue.push(task1)
    taskQueue.push(task2)
    taskQueue.push(task3)

    requestIdleCallbackMock.idle(15)
    expect(task1).toHaveBeenCalled()
    expect(task2).toHaveBeenCalled()
    expect(task3).not.toHaveBeenCalled()

    requestIdleCallbackMock.idle(5)
    expect(task3).toHaveBeenCalled()
  })

  it('runs some tasks in case of timeout', () => {
    const clock = mockClock()
    registerCleanupTask(clock.cleanup)
    const requestIdleCallbackMock = mockRequestIdleCallback()

    const task1 = jasmine.createSpy().and.callFake(() => clock.tick(TIMED_OUT_TIME_REMAINING - 10))
    const task2 = jasmine.createSpy().and.callFake(() => clock.tick(20))
    const task3 = jasmine.createSpy().and.callFake(() => clock.tick(20))

    const taskQueue = createTaskQueue()

    taskQueue.push(task1)
    taskQueue.push(task2)
    taskQueue.push(task3)

    requestIdleCallbackMock.timeout()
    expect(task1).toHaveBeenCalled()
    expect(task2).toHaveBeenCalled()
    expect(task3).not.toHaveBeenCalled()
  })
})
