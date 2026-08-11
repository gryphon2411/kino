export class ViewingPlanError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class InvalidRequestError extends ViewingPlanError {
  constructor(message) {
    super(400, 'invalid_request', message);
  }
}

export class InvalidTokenError extends ViewingPlanError {
  constructor() {
    super(401, 'invalid_token');
  }
}

export class InsufficientScopeError extends ViewingPlanError {
  constructor(scope) {
    super(403, 'insufficient_scope');
    this.scope = scope;
  }
}

export class NotFoundError extends ViewingPlanError {
  constructor() {
    super(404, 'not_found');
  }
}

export class OpenPlanExistsError extends ViewingPlanError {
  constructor() {
    super(409, 'open_plan_exists');
  }
}

export class ServiceUnavailableError extends ViewingPlanError {
  constructor() {
    super(503, 'temporarily_unavailable');
  }
}
