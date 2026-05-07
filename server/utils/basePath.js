/**
 * [base-path] Shared BASE_PATH helper for the server.
 *
 * `BASE_PATH` is read from the environment exactly once at module load. It is
 * normalized to:
 *   - "" when no sub-path is configured (default deployment at the domain root)
 *   - "/<segment>"... with NO trailing slash otherwise (e.g. "/ia").
 *
 * Express prefers prefixes without a trailing slash so `app.use("/ia", ...)`
 * matches both "/ia" and "/ia/foo". Vite, on the other hand, requires the
 * trailing slash on its `base` option; that divergence is intentionally kept
 * — the Dockerfile passes `/ia/` to the frontend build and `/ia` to the
 * server runtime, and this helper is the single source of truth on the server
 * side.
 *
 * Use `joinBase(path)` to compose route paths: it always returns a string that
 * starts with `BASE_PATH` (if any) and avoids double slashes.
 */

const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/+$/, "");

/**
 * Joins the configured BASE_PATH with a sub-path. Returns "/" when both are
 * empty (sane default for catch-all middleware).
 *
 * Examples (BASE_PATH = "/ia"):
 *   joinBase("/api")     -> "/ia/api"
 *   joinBase("api")      -> "/ia/api"
 *   joinBase("")         -> "/ia"
 *   joinBase("/")        -> "/ia"
 *
 * Examples (BASE_PATH = ""):
 *   joinBase("/api")     -> "/api"
 *   joinBase("/")        -> "/"
 *   joinBase("")         -> "/"
 *
 * @param {string} subPath
 * @returns {string}
 */
function joinBase(subPath = "") {
  const cleanedSub = String(subPath || "").replace(/\/+$/, "");
  if (!BASE_PATH) {
    if (!cleanedSub) return "/";
    return cleanedSub.startsWith("/") ? cleanedSub : `/${cleanedSub}`;
  }
  if (!cleanedSub || cleanedSub === "/") return BASE_PATH;
  return `${BASE_PATH}${cleanedSub.startsWith("/") ? cleanedSub : `/${cleanedSub}`}`;
}

module.exports = {
  BASE_PATH,
  joinBase,
};
