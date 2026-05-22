const cookieSession = require("cookie-session");
const { withRefreshIfNeeded } = require("./tokenRefresh");

function createSessionMiddleware(config) {
  const options = {
    name: "bff.sid",
    keys: [config.bff.sessionSecret],
    httpOnly: true,
    secure: config.bff.cookieSecure,
    sameSite: "lax",
    maxAge: 30 * 60 * 1000,
    path: config.anythingllm.basePath,
  };

  if (config.bff.cookieDomain) {
    options.domain = config.bff.cookieDomain;
  }

  return cookieSession(options);
}

function isSessionValid(req) {
  return Boolean(req.session?.auth?.anythingLlmUserId);
}

function loginRedirect(req, config) {
  const redirectTo = encodeURIComponent(req.originalUrl || config.anythingllm.basePath);
  return `${config.anythingllm.basePath}/auth/login?redirectTo=${redirectTo}`;
}

function requireSession(config, deps) {
  const { oidc, logger } = deps;

  return async function sessionGuard(req, res, next) {
    if (!isSessionValid(req)) {
      return res.redirect(loginRedirect(req, config));
    }

    try {
      await withRefreshIfNeeded(req, oidc, logger);
      return next();
    } catch (error) {
      logger.warn({ err: error }, "refresh failed; forcing re-authentication");
      req.session = null;
      return res.redirect(loginRedirect(req, config));
    }
  };
}

module.exports = { createSessionMiddleware, requireSession };
