const crypto = require("node:crypto");
const {
  normalizeUsername,
  withCollisionSuffix,
} = require("./usernameNormalizer");

function readClaimByPath(claims, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object") return acc[key];
    return undefined;
  }, claims);
}

function mapRole(claims, config) {
  const values = readClaimByPath(claims, config.roleMapping.claimSource);
  const roles = Array.isArray(values) ? values : [];

  if (roles.includes(config.roleMapping.adminRole)) return "admin";
  if (roles.includes(config.roleMapping.managerRole)) return "manager";
  return "default";
}

function generatePassword() {
  return crypto.randomBytes(48).toString("base64url");
}

function isDuplicateUsername(error) {
  return /already exists/i.test(error?.message || "");
}

async function findByUsername(anythingllm, username) {
  const { users = [] } = await anythingllm.listUsers();
  return users.find((user) => user.username === username) || null;
}

async function createWithRetry(anythingllm, userInput, sub) {
  try {
    const created = await anythingllm.createUser(userInput);
    return created.user;
  } catch (error) {
    if (!isDuplicateUsername(error)) throw error;

    const fallbackUsername = withCollisionSuffix(userInput.username, sub);
    const created = await anythingllm.createUser({
      ...userInput,
      username: fallbackUsername,
    });
    return created.user;
  }
}

async function reconcileUser(claims, anythingllm, config, logger) {
  const sub = String(claims.sub || "");
  const username = normalizeUsername(claims.preferred_username, sub);
  const role = mapRole(claims, config);
  const bio = claims.email ? `email:${claims.email}` : "";

  let user = await findByUsername(anythingllm, username);

  if (!user) {
    user = await createWithRetry(
      anythingllm,
      {
        username,
        password: generatePassword(),
        role,
        bio,
      },
      sub
    );

    logger.info({ username: user.username, sub, role }, "JIT user created");
    return { user, role };
  }

  if (config.roleMapping.syncOnLogin && user.role !== role) {
    const previousRole = user.role;
    await anythingllm.updateUser(user.id, { role });
    user.role = role;
    logger.info(
      { username: user.username, from: previousRole, to: role, sub },
      "User role synchronized from OIDC claims"
    );
  }

  return { user, role };
}

module.exports = { reconcileUser, mapRole };
