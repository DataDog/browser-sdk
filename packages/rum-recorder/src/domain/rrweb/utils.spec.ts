import { sortNodesByTopologicalOrder } from './utils'

describe('sortNodesByTopologicalOrder', () => {
  let parent: Node
  let a: Node
  let aa: Node
  let b: Node
  let c: Node
  let d: Node

  beforeEach(() => {
    // Create a tree like this:
    //     parent
    //     / | \ \
    //    a  b c d
    //    |
    //    aa
    a = document.createElement('a')
    aa = document.createElement('aa')
    b = document.createElement('b')
    c = document.createElement('c')
    d = document.createElement('d')
    parent = document.createElement('parent')
    parent.appendChild(a)
    a.appendChild(aa)
    parent.appendChild(b)
    parent.appendChild(c)
    parent.appendChild(d)
  })

  it('sorts siblings in reverse order', () => {
    const nodes = [c, b, d, a]
    sortNodesByTopologicalOrder(nodes)
    expect(nodes).toEqual([d, c, b, a])
  })

  it('sorts parents', () => {
    const nodes = [a, parent, aa]
    sortNodesByTopologicalOrder(nodes)
    expect(nodes).toEqual([parent, a, aa])
  })

  it('sorts parents first then siblings', () => {
    const nodes = [c, aa, b, parent, d, a]
    sortNodesByTopologicalOrder(nodes)
    expect(nodes).toEqual([parent, d, c, b, a, aa])
  })
})
