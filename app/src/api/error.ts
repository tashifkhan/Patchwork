export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isConflict() {
    return this.status === 409 || this.status === 412;
  }

  get isNotImplemented() {
    return this.status === 501;
  }
}
