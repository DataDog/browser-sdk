class StrictlyPositiveNumber {
  asymmetricMatch(other: any) {
    return typeof other === 'number' && !isNaN(other) && other > 0
  }

  jasmineToString() {
    return '<strictlyPositiveNumber>'
  }
}

export const strictlyPositiveNumber = () => new StrictlyPositiveNumber()

class PositiveNumber {
  asymmetricMatch(other: any) {
    return typeof other === 'number' && !isNaN(other) && other >= 0
  }

  jasmineToString() {
    return '<positiveNumber>'
  }
}

export const positiveNumber = () => new PositiveNumber()
