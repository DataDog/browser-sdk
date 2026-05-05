import { notifySalesforceResourcePoll, subscribeToSalesforceResourcePoll } from './resourcePollChannel'

describe('salesforce resource poll channel', () => {
  it('notifies subscribers with the latest poll payload', () => {
    const callback = jasmine.createSpy()
    const subscription = subscribeToSalesforceResourcePoll(callback)

    notifySalesforceResourcePoll({
      currentView: { startRelativeTime: 123 },
      resourceEntries: [{ responseEnd: 456 }],
    })

    expect(callback).toHaveBeenCalledOnceWith({
      currentView: { startRelativeTime: 123 },
      resourceEntries: [{ responseEnd: 456 }],
    })

    subscription.unsubscribe()
  })
})
