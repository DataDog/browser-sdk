import { vi } from 'vitest'
import { mockClock, mockRequestIdleCallback } from '../../test'
import { createTaskQueue, MAX_EXECUTION_TIME_ON_TIMEOUT } from './taskQueue'

describe('createTaskQueue', () => {
  it('runs the task using an idle callback', () => {
    const requestIdleCallbackMock = mockRequestIdleCallback()
    const taskQueue = createTaskQueue()
    const task = vi.fn()

    taskQueue.push(task)
    expect(task).not.toHaveBeenCalled()

    requestIdleCallbackMock.idle()
    expect(task).toHaveBeenCalled()
  })

  it('runs as many tasks as possible in a single idle callback', () => {
    const clock = mockClock()
    const requestIdleCallbackMock = mockRequestIdleCallback()

    // Each task takes 10ms to run
    const task1 = vi.fn().mockImplementation(() => clock.tick(10))
    const task2 = vi.fn().mockImplementation(() => clock.tick(10))
    const task3 = vi.fn().mockImplementation(() => clock.tick(10))

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
    const requestIdleCallbackMock = mockRequestIdleCallback()

    const task1 = vi.fn().mockImplementation(() => clock.tick(MAX_EXECUTION_TIME_ON_TIMEOUT - 10))
    const task2 = vi.fn().mockImplementation(() => clock.tick(20))
    const task3 = vi.fn().mockImplementation(() => clock.tick(20))

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
