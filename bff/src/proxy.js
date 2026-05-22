const { createProxyMiddleware } = require("http-proxy-middleware");

function createAnythingProxy(config, logger) {
  return createProxyMiddleware({
    target: config.anythingllm.baseUrl,
    changeOrigin: true,
    ws: true,
    xfwd: true,
    pathRewrite: (path) => {
      const basePath = config.anythingllm.basePath;
      return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
    },
    logProvider: () => ({
      log: (...args) => logger.debug({ args }, "proxy log"),
      debug: (...args) => logger.debug({ args }, "proxy debug"),
      info: (...args) => logger.info({ args }, "proxy info"),
      warn: (...args) => logger.warn({ args }, "proxy warning"),
      error: (...args) => logger.error({ args }, "proxy error"),
    }),
    onError: (err, req, res) => {
      logger.error({ err, path: req.url }, "proxy request failed");
      if (!res.headersSent) {
        res.status(502).json({ error: "Upstream proxy error" });
      }
    },
  });
}

module.exports = { createAnythingProxy };
