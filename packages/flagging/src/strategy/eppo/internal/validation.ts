export class InvalidArgumentError extends Error {}

export function validateNotBlank(value: string, errorMessage: string) {
  if (value == null || value.length === 0) {
    throw new InvalidArgumentError(errorMessage);
  }
}
