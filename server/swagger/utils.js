const fs = require("fs");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
// [base-path] Swagger UI is mounted directly on `app`, so it bypasses the
// apiRouter's BASE_PATH prefix. We need to prepend BASE_PATH manually here.
const { joinBase } = require("../utils/basePath");

function faviconUrl() {
  return process.env.NODE_ENV === "production"
    ? "/public/favicon.png"
    : "http://localhost:3000/public/favicon.png";
}

/**
 * [base-path] Returns the swagger document with its `servers` field rewritten
 * to point at the BASE_PATH-prefixed API. Without this, the "Try it out"
 * buttons in the swagger UI would fire requests at `/api/...` instead of
 * `/ia/api/...` and 404. We do NOT mutate the original JSON object so this
 * stays a no-op for default deployments.
 */
function patchedSwaggerDocument() {
  const swaggerDocument = require("./openapi.json");
  return {
    ...swaggerDocument,
    servers: [{ url: joinBase("/api") }],
  };
}

function useSwagger(app) {
  if (process.env.DISABLE_SWAGGER_DOCS === "true") {
    console.log(
      `\x1b[33m[SWAGGER DISABLED]\x1b[0m Swagger documentation is disabled via DISABLE_SWAGGER_DOCS environment variable.`
    );
    return;
  }
  // [base-path] Mount swagger UI under BASE_PATH (e.g. "/ia/api/docs").
  const docsPath = joinBase("/api/docs");
  app.use(docsPath, swaggerUi.serve);
  const options = {
    customCss: [
      fs.readFileSync(path.resolve(__dirname, "index.css")),
      fs.readFileSync(path.resolve(__dirname, "dark-swagger.css")),
    ].join("\n\n\n"),
    customSiteTitle: "AnythingLLM Developer API Documentation",
    customfavIcon: faviconUrl(),
  };

  if (process.env.NODE_ENV === "production") {
    app.get(
      docsPath,
      swaggerUi.setup(patchedSwaggerDocument(), {
        ...options,
        customJsStr:
          'window.SWAGGER_DOCS_ENV = "production";\n\n' +
          fs.readFileSync(path.resolve(__dirname, "index.js"), "utf8"),
      })
    );
  } else {
    // we regenerate the html page only in development mode to ensure it is up-to-date when the code is hot-reloaded.
    app.get(docsPath, async (_, response) => {
      // #swagger.ignore = true
      return response.send(
        swaggerUi.generateHTML(patchedSwaggerDocument(), {
          ...options,
          customJsStr:
            'window.SWAGGER_DOCS_ENV = "development";\n\n' +
            fs.readFileSync(path.resolve(__dirname, "index.js"), "utf8"),
        })
      );
    });
  }
}

module.exports = { faviconUrl, useSwagger };
