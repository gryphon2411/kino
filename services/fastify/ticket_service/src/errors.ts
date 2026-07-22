export class TicketError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export class BadRequestError extends TicketError {
  constructor(code: string, message: string) {
    super(400, code, message);
  }
}

export class InvalidTokenError extends TicketError {
  constructor() {
    super(401, 'invalid_token', 'A valid ticket access token is required.');
  }
}

export class InsufficientScopeError extends TicketError {
  constructor(public readonly scope: string) {
    super(403, 'insufficient_scope', 'Ticket permission is required.');
  }
}

export class NotFoundError extends TicketError {
  constructor(message = 'The requested ticket resource was not found.') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends TicketError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class ServiceUnavailableError extends TicketError {
  constructor() {
    super(503, 'temporarily_unavailable', 'Ticket allocation is temporarily unavailable.');
  }
}
