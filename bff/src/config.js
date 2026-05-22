const { z } = require("zod");

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

const normalizeBasePath = (value) => {
  if (!value) return "/ia";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/, "")
    : withLeadingSlash;
};

const schema = z.object({
  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.string().url(),
  OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url(),
  OIDC_SCOPES: z.string().default("openid profile email"),
  ROLE_CLAIM_SOURCE: z.string().default("realm_access.roles"),
  ROLE_MAP_ADMIN: z.string().default("anythingllm-admin"),
  ROLE_MAP_MANAGER: z.string().default("anythingllm-manager"),
  SYNC_ROLES_ON_LOGIN: z.string().optional(),
  ANYTHINGLLM_BASE_URL: z.string().url(),
  ANYTHINGLLM_API_KEY: z.string().min(1),
  ANYTHINGLLM_BASE_PATH: z.string().default("/ia"),
  BFF_PORT: z.string().default("3003"),
  BFF_SESSION_SECRET: z.string().min(32),
  BFF_COOKIE_SECURE: z.string().optional(),
  BFF_COOKIE_DOMAIN: z.string().optional(),
  BFF_TRUST_PROXY: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
});

function loadConfig(env = process.env) {
  const parsed = schema.parse(env);
  const basePath = normalizeBasePath(parsed.ANYTHINGLLM_BASE_PATH);

  return {
    oidc: {
      issuer: parsed.OIDC_ISSUER,
      clientId: parsed.OIDC_CLIENT_ID,
      clientSecret: parsed.OIDC_CLIENT_SECRET,
      redirectUri: parsed.OIDC_REDIRECT_URI,
      postLogoutRedirectUri: parsed.OIDC_POST_LOGOUT_REDIRECT_URI,
      scopes: parsed.OIDC_SCOPES,
    },
    roleMapping: {
      claimSource: parsed.ROLE_CLAIM_SOURCE,
      adminRole: parsed.ROLE_MAP_ADMIN,
      managerRole: parsed.ROLE_MAP_MANAGER,
      syncOnLogin: toBoolean(parsed.SYNC_ROLES_ON_LOGIN, true),
    },
    anythingllm: {
      baseUrl: parsed.ANYTHINGLLM_BASE_URL.replace(/\/+$/, ""),
      apiKey: parsed.ANYTHINGLLM_API_KEY,
      basePath,
    },
    bff: {
      port: Number(parsed.BFF_PORT),
      sessionSecret: parsed.BFF_SESSION_SECRET,
      cookieSecure: toBoolean(parsed.BFF_COOKIE_SECURE, true),
      cookieDomain: parsed.BFF_COOKIE_DOMAIN,
      trustProxy: toBoolean(parsed.BFF_TRUST_PROXY, true),
      logLevel: parsed.LOG_LEVEL,
    },
  };
}

module.exports = { loadConfig };
