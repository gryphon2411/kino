/**
 * Starts the local BFF transaction before the browser leaves for the OIDC
 * authorization endpoint. This must stay a same-origin POST so an unrelated
 * site cannot create login state with a top-level GET navigation.
 */
export async function beginLogin(returnTo) {
  const response = await fetch(
    `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    }
  );
  const body = await response.json();
  if (!response.ok || !body.authorizationUrl) {
    throw new Error(body.error || 'Unable to initiate login.');
  }

  window.location.assign(body.authorizationUrl);
}
