export class ServiceError extends Error {
  constructor({ status, error, code, details, reason }) {
    super(error);
    this.name = "ServiceError";
    Object.assign(this, { status, code, details, reason });
  }
}
