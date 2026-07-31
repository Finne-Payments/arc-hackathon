/* HTTP error type used by handlers. Maps to the plain-language error envelope
   (PRD §11.1): every error is { "error": "<plain-language sentence>" }. */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
