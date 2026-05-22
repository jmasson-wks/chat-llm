const pino = require("pino");

function createLogger(level = "info") {
  return pino({
    level,
    base: {
      service: "anythingllm-bff-oidc",
    },
    redact: ["req.headers.cookie", "session.auth.refreshToken", "session.auth.idToken"],
  });
}

module.exports = { createLogger };
