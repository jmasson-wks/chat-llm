class AnythingLlmClient {
  constructor(config) {
    this.baseUrl = config.anythingllm.baseUrl;
    this.basePath = config.anythingllm.basePath;
    this.apiKey = config.anythingllm.apiKey;
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${this.basePath}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      const error = new Error(payload?.error || `AnythingLLM API error (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  listUsers() {
    return this.request("/api/v1/admin/users", { method: "GET" });
  }

  createUser(body) {
    return this.request("/api/v1/admin/users/new", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  updateUser(userId, body) {
    return this.request(`/api/v1/admin/users/${userId}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  issueAuthToken(userId) {
    return this.request(`/api/v1/users/${userId}/issue-auth-token`, {
      method: "GET",
    });
  }
}

function createAnythingLlmClient(config) {
  return new AnythingLlmClient(config);
}

module.exports = { createAnythingLlmClient };
