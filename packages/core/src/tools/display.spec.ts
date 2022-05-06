import { ConsoleApiName } from '../domain/console/consoleObservable'
import { display } from './display'

describe('display function', () => {
  it('displays a message with the provided console api', () => {
    spyOn(display, 'info')
    display(ConsoleApiName.info, 'foo')
    expect(display.info).toHaveBeenCalledOnceWith('foo')
  })

  it('fallbacks to `display.log` if provided with an incorrect console api name', () => {
    spyOn(display, 'log')
    display('unknown' as ConsoleApiName, 'foo')
    expect(display.log).toHaveBeenCalledOnceWith('foo')
  })
})
