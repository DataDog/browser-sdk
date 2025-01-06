// eslint-disable-next-line no-restricted-syntax
export class RichError extends Error {
  name: string;
  message: string;
  errorContext: object | undefined;

  constructor(name: string, message: string, context?: object) {
    super(message);
    this.name = name;
    this.message = message;
    this.errorContext = context;
  }
}

