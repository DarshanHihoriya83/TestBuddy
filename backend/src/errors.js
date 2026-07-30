export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function unauthorized(message = "Unauthorized") {
  return new HttpError(401, message);
}

export function notFound(message) {
  return new HttpError(404, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}
