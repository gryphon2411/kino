import * as oidc from 'openid-client';
import { getBffConfig } from './config';

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
  if (url instanceof Request) {
    // Refresh grants are supplied as Requests. Keep their POST method, body,
    // and client authentication while replacing only the public origin.
    return fetch(new Request(internalUrl, url), options);
  }
  return fetch(internalUrl, options);
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
