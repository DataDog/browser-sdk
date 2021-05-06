import { isIE } from '../../../../core/test/specHelper'
import { createMutationPayloadValidator } from '../../../test/utils'
import { snapshot, NodeType } from '../rrweb-snapshot'
import { MutationObserverWrapper, MutationController } from './mutation'
import { MutationCallBack } from './types'

describe('MutationObserverWrapper', () => {
  let sandbox: HTMLElement
  let mutationCallbackSpy: jasmine.Spy<MutationCallBack>
  let mutationController: MutationController
  let mutationObserverWrapper: MutationObserverWrapper

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    sandbox = document.createElement('div')
    sandbox.id = 'sandbox'
    document.body.appendChild(sandbox)

    mutationCallbackSpy = jasmine.createSpy<MutationCallBack>()
    mutationController = new MutationController()

    mutationObserverWrapper = new MutationObserverWrapper(mutationController, mutationCallbackSpy)
  })

  afterEach(() => {
    mutationObserverWrapper.stop()
    sandbox.remove()
  })

  it('generates a mutation when a node is appended to a known node', () => {
    const serializedDocument = snapshot(document)[0]!

    sandbox.appendChild(document.createElement('div'))

    mutationController.flush()

    expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

    const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
    validate(mutationCallbackSpy.calls.mostRecent().args[0], {
      adds: [
        {
          parent: expectInitialNode({ idAttribute: 'sandbox' }),
          node: expectNewNode({ type: NodeType.Element, tagName: 'div' }),
        },
      ],
    })
  })

  it('does not generate a mutation when a node is appended to a unknown node', () => {
    sandbox.appendChild(document.createElement('div'))

    mutationController.flush()

    expect(mutationCallbackSpy).not.toHaveBeenCalled()
  })

  it('emits buffered mutation records on flush', () => {
    snapshot(document)

    sandbox.appendChild(document.createElement('div'))

    expect(mutationCallbackSpy).toHaveBeenCalledTimes(0)

    mutationController.flush()

    expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
  })
})
