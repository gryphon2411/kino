import * as oidc from 'openid-client';
import { getBffConfig } from './config.js';

let configurationPromise;

async function internalOidcFetch(url, options) {
  const config = getBffConfig();
  const requestedUrl = new URL(url instanceof Request ? url.url : url);
  if (requestedUrl.origin !== config.issuer.origin) {
    return fetch(url, options);
  }

  const internalUrl = new URL(
    `${requestedUrl.pathname}${requestedUrl.search}`,
    config.internalOidcOrigin
  );
  // Refresh grants are supplied as Requests. Keep their POST method, body,
  // and client authentication while replacing only the public origin.
  const internalRequest = url instanceof Request
    ? new Request(internalUrl, url)
    : internalUrl;
  return fetch(internalRequest, options);
}

export async function getOidcConfiguration() {
  if (!configurationPromise) {
    const config = getBffConfig();
    configurationPromise = oidc.discovery(
      config.issuer,
      config.clientId,
      undefined,
      oidc.ClientSecretBasic(config.clientSecret),
      {
        [oidc.customFetch]: internalOidcFetch,
        // Local Kino currently uses HTTP. Production ingress should use HTTPS.
        execute: [oidc.allowInsecureRequests],
      }
    ).catch((error) => {
      configurationPromise = undefined;
      throw error;
    });
  }
  return configurationPromise;
}

export async function authorizationUrl(transaction) {
  const config = getBffConfig();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(
    transaction.codeVerifier
  );
  return oidc.buildAuthorizationUrl(await getOidcConfiguration(), {
    redirect_uri: config.redirectUri,
    scope: config.scopes,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

export async function endSessionUrl(transaction, idTokenHint) {
  const config = getBffConfig();
  return oidc.buildEndSessionUrl(await getOidcConfiguration(), {
    id_token_hint: idTokenHint,
    post_logout_redirect_uri: config.postLogoutRedirectUri,
    state: transaction.state,
  }).href;
}
