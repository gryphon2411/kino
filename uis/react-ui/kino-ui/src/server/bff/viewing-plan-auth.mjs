export function viewingPlanBearerError(status, challenge) {
  if (status !== 401 && status !== 403) {
    return undefined;
  }
  const match = (challenge || '').match(/^Bearer\s+.*\berror="([a-z_]+)"/i);
  const error = match?.[1];
  if (status === 403 && error === 'insufficient_scope') {
    return 'insufficient_scope';
  }
  if (status === 401 && error === 'invalid_token') {
    return 'invalid_token';
  }
  return undefined;
}
