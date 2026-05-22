const express = require("express");
const helmet = require("helmet");
const { loadConfig } = require("./config");
const { createLogger } = require("./logger");
const { getOidcContext } = require("./auth/oidcClient");
const { createSessionMiddleware, requireSession } = require("./auth/session");
const { createAuthRouter } = require("./auth/routes");
const { createAnythingLlmClient } = require("./anythingllm/client");
const { createAnythingProxy } = require("./proxy");

async function bootstrap() {
  const config = loadConfig();
  const logger = createLogger(config.bff.logLevel);
  const oidc = await getOidcContext(config);
  const anythingllm = createAnythingLlmClient(config);

  const app = express();
  app.set("trust proxy", config.bff.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(createSessionMiddleware(config));

  app.get(`${config.anythingllm.basePath}/healthz`, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(
    `${config.anythingllm.basePath}/auth`,
    createAuthRouter(config, { oidc, anythingllm, logger })
  );

  const proxy = createAnythingProxy(config, logger);
  app.use(
    config.anythingllm.basePath,
    requireSession(config, { oidc, logger }),
    proxy
  );

  app.listen(config.bff.port, () => {
    logger.info(
      {
        port: config.bff.port,
        basePath: config.anythingllm.basePath,
        oidcIssuer: config.oidc.issuer,
      },
      "BFF OIDC server started"
    );
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error", error);
  process.exit(1);
});
