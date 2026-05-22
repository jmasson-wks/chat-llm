const express = require("express");
const { generators } = require("openid-client");
const { reconcileUser } = require("../anythingllm/userMapping");

function withBasePath(basePath, path) {
  if (!path) return basePath;
  if (path.startsWith(basePath)) return path;
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeRedirectPath(candidate, config) {
  if (!candidate || typeof candidate !== "string") return config.anythingllm.basePath;
  if (!candidate.startsWith(config.anythingllm.basePath)) return config.anythingllm.basePath;
  return candidate;
}

function createAuthRouter(config, deps) {
  const router = express.Router();
  const { oidc, anythingllm, logger } = deps;

  router.get("/login", async (req, res) => {
    if (req.session?.auth?.anythingLlmUserId) {
      return res.redirect(config.anythingllm.basePath);
    }

    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    req.session.oidc = {
      state,
      nonce,
      codeVerifier,
      redirectTo: safeRedirectPath(req.query.redirectTo, config),
    };

    const authorizationUrl = oidc.client.authorizationUrl({
      scope: config.oidc.scopes,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    return res.redirect(authorizationUrl);
  });

  router.get("/callback", async (req, res) => {
    try {
      const oidcSession = req.session?.oidc;
      if (!oidcSession?.state || !oidcSession?.codeVerifier || !oidcSession?.nonce) {
        return res.status(400).json({ error: "OIDC state is missing or expired" });
      }

      const params = oidc.client.callbackParams(req);
      const tokenSet = await oidc.client.callback(config.oidc.redirectUri, params, {
        state: oidcSession.state,
        nonce: oidcSession.nonce,
        code_verifier: oidcSession.codeVerifier,
      });

      const claims = tokenSet.claims();
      const { user } = await reconcileUser(claims, anythingllm, config, logger);
      const issuedToken = await anythingllm.issueAuthToken(user.id);

      req.session.auth = {
        sub: claims.sub,
        username: user.username,
        anythingLlmUserId: user.id,
        idToken: tokenSet.id_token,
        refreshToken: tokenSet.refresh_token,
        expiresAt: Date.now() + ((tokenSet.expires_in || 300) * 1000),
      };

      req.session.oidc = null;

      logger.info(
        {
          sub: claims.sub,
          username: user.username,
          anythingLlmUserId: user.id,
        },
        "OIDC login completed"
      );

      return res.redirect(withBasePath(config.anythingllm.basePath, issuedToken.loginPath));
    } catch (error) {
      logger.error({ err: error }, "OIDC callback failed");
      req.session = null;
      return res.status(502).json({ error: "OIDC authentication failed" });
    }
  });

  router.get("/logout", (req, res) => {
    const idTokenHint = req.session?.auth?.idToken;
    req.session = null;

    const endSessionEndpoint = oidc.issuer.metadata.end_session_endpoint;
    if (!endSessionEndpoint) {
      return res.redirect(config.anythingllm.basePath);
    }

    const logoutUrl = new URL(endSessionEndpoint);
    if (idTokenHint) logoutUrl.searchParams.set("id_token_hint", idTokenHint);
    logoutUrl.searchParams.set(
      "post_logout_redirect_uri",
      config.oidc.postLogoutRedirectUri
    );

    return res.redirect(logoutUrl.toString());
  });

  router.get("/me", (req, res) => {
    if (!req.session?.auth) {
      return res.status(401).json({ error: "No active session" });
    }

    return res.status(200).json({
      session: {
        sub: req.session.auth.sub,
        username: req.session.auth.username,
        anythingLlmUserId: req.session.auth.anythingLlmUserId,
        expiresAt: req.session.auth.expiresAt,
      },
    });
  });

  return router;
}

module.exports = { createAuthRouter };
