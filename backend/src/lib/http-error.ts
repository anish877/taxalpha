export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly fieldErrors?: Record<string, string>;

  constructor(statusCode: number, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}
