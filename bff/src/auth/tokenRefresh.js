async function withRefreshIfNeeded(req, oidc, logger) {
  const auth = req.session?.auth;
  if (!auth?.expiresAt) return;

  const refreshWindowMs = 30 * 1000;
  if (Date.now() < auth.expiresAt - refreshWindowMs) return;
  if (!auth.refreshToken) {
    throw new Error("Refresh token missing from session");
  }

  const tokenSet = await oidc.client.refresh(auth.refreshToken);
  const claims = tokenSet.claims();

  req.session.auth = {
    ...auth,
    sub: claims.sub || auth.sub,
    username: claims.preferred_username || auth.username,
    idToken: tokenSet.id_token || auth.idToken,
    refreshToken: tokenSet.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + ((tokenSet.expires_in || 300) * 1000),
  };

  logger.debug({ sub: req.session.auth.sub }, "OIDC refresh completed");
}

module.exports = { withRefreshIfNeeded };
