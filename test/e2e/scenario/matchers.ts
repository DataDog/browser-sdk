class StrictlyPositiveNumber {
  asymmetricMatch(other: any) {
    return typeof other === 'number' && !isNaN(other) && other > 0
  }

  jasmineToString() {
    return '<positiveNumber>'
  }
}

export const strictlyPositiveNumber = () => new StrictlyPositiveNumber()
