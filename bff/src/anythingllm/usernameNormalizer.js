function sanitize(input = "") {
  return String(input).toLowerCase().replace(/[^a-z0-9._@-]/g, "_");
}

function ensureLengthAndPrefix(value = "", sub = "") {
  let username = value;
  if (!username) {
    username = `u_${sanitize(sub).replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
  }

  if (!/^[a-z]/.test(username)) {
    username = `u_${username}`;
  }

  if (username.length < 2) {
    username = `${username}0`;
  }

  if (username.length > 32) {
    username = username.slice(0, 32);
  }

  if (!/^[a-z]/.test(username)) {
    username = `u${username.slice(0, 31)}`;
  }

  return username;
}

function normalizeUsername(preferredUsername, sub) {
  return ensureLengthAndPrefix(sanitize(preferredUsername), sub);
}

function withCollisionSuffix(username, sub) {
  const suffix = sanitize(sub).replace(/[^a-z0-9]/g, "").slice(0, 6) || "user01";
  const maxBase = 32 - suffix.length - 1;
  const base = username.slice(0, maxBase);
  return ensureLengthAndPrefix(`${base}_${suffix}`, sub);
}

module.exports = { normalizeUsername, withCollisionSuffix };
