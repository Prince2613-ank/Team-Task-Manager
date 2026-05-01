export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notFound(message = 'Resource not found') {
  return new HttpError(404, message);
}

export function forbidden(message = 'You do not have access to this resource') {
  return new HttpError(403, message);
}

export function badRequest(message = 'Invalid request') {
  return new HttpError(400, message);
}
