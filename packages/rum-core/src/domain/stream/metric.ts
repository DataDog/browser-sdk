// eslint-disable-next-line no-restricted-syntax
abstract class Metric {
  constructor(private name: string) {}

  update(value: number, weight?: number): void {
    // This method is a placeholder for metric updates.
  }
}

// eslint-disable-next-line no-restricted-syntax
export class WeightAverageMetric extends Metric {
  private average: number = 0
  private weight: number = 0

  update(value: number, weight: number): void {
    this.average = (this.average * this.weight + value * weight) / (this.weight + weight)
    this.weight += weight
  }
}
