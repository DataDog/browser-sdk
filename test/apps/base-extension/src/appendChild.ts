const originalAppendChild = Node.prototype.appendChild // eslint-disable-line @typescript-eslint/unbound-method

Node.prototype.appendChild = function <T extends Node>(node: T): T {
  return originalAppendChild.call(this, node) as T
}
