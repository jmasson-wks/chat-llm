const { Issuer } = require("openid-client");

let discoveryPromise = null;

async function getOidcContext(config) {
  if (!discoveryPromise) {
    discoveryPromise = Issuer.discover(config.oidc.issuer).then((issuer) => {
      const client = new issuer.Client({
        client_id: config.oidc.clientId,
        client_secret: config.oidc.clientSecret,
        redirect_uris: [config.oidc.redirectUri],
        response_types: ["code"],
      });

      return { issuer, client };
    });
  }

  return discoveryPromise;
}

module.exports = { getOidcContext };
