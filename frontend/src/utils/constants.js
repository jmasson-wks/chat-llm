export const API_BASE = import.meta.env.VITE_API_BASE || "/api";
export const ONBOARDING_SURVEY_URL = "https://onboarding.anythingllm.com";

export const AUTH_USER = "anythingllm_user";
export const AUTH_TOKEN = "anythingllm_authToken";
export const AUTH_TIMESTAMP = "anythingllm_authTimestamp";
export const COMPLETE_QUESTIONNAIRE = "anythingllm_completed_questionnaire";
export const SEEN_DOC_PIN_ALERT = "anythingllm_pinned_document_alert";
export const SEEN_WATCH_ALERT = "anythingllm_watched_document_alert";
export const LAST_VISITED_WORKSPACE = "anythingllm_last_visited_workspace";
export const USER_PROMPT_INPUT_MAP = "anythingllm_user_prompt_input_map";
export const PENDING_HOME_MESSAGE = "anythingllm_pending_home_message";

export const APPEARANCE_SETTINGS = "anythingllm_appearance_settings";

export const OLLAMA_COMMON_URLS = [
  "http://127.0.0.1:11434",
  "http://host.docker.internal:11434",
  "http://172.17.0.1:11434",
];

export const LMSTUDIO_COMMON_URLS = [
  "http://localhost:1234/v1",
  "http://127.0.0.1:1234/v1",
  "http://host.docker.internal:1234/v1",
  "http://172.17.0.1:1234/v1",
];

export const KOBOLDCPP_COMMON_URLS = [
  "http://127.0.0.1:5000/v1",
  "http://localhost:5000/v1",
  "http://host.docker.internal:5000/v1",
  "http://172.17.0.1:5000/v1",
];

export const LOCALAI_COMMON_URLS = [
  "http://127.0.0.1:8080/v1",
  "http://localhost:8080/v1",
  "http://host.docker.internal:8080/v1",
  "http://172.17.0.1:8080/v1",
];

export const DPAIS_COMMON_URLS = [
  "http://127.0.0.1:8553/v1/openai",
  "http://0.0.0.0:8553/v1/openai",
  "http://localhost:8553/v1/openai",
  "http://host.docker.internal:8553/v1/openai",
];

export const NVIDIA_NIM_COMMON_URLS = [
  "http://127.0.0.1:8000/v1/version",
  "http://localhost:8000/v1/version",
  "http://host.docker.internal:8000/v1/version",
  "http://172.17.0.1:8000/v1/version",
];

export const DOCKER_MODEL_RUNNER_COMMON_URLS = [
  "http://localhost:12434/engines/llama.cpp/v1",
  "http://127.0.0.1:12434/engines/llama.cpp/v1",
  "http://model-runner.docker.internal/engines/llama.cpp/v1",
  "http://host.docker.internal:12434/engines/llama.cpp/v1",
  "http://172.17.0.1:12434/engines/llama.cpp/v1",
];

export const LEMONADE_COMMON_URLS = [
  "http://localhost:8000/live",
  "http://127.0.0.1:8000/live",
  "http://host.docker.internal:8000/live",
  "http://172.17.0.1:8000/live",

  // In Lemonade 10.1.0 the base port is 13305
  "http://localhost:13305/live",
  "http://127.0.0.1:13305/live",
  "http://host.docker.internal:13305/live",
  "http://172.17.0.1:13305/live",
];

export function fullApiUrl() {
  // [base-path] When API_BASE is relative (e.g. "/api" or "/ia/api") we need
  // to build a fully-qualified URL because callers feed the result into
  // `new URL(...)` which throws on relative inputs. Previously only "/api"
  // got the origin prepended; sub-path builds (API_BASE === "/ia/api") would
  // return a bare relative path and crash in `models/system.js`,
  // `models/workspace.js`, and the BrowserExtension API key helpers.
  if (API_BASE.startsWith("/")) return `${window.location.origin}${API_BASE}`;
  // Already absolute (dev mode: http://localhost:3001/api).
  return API_BASE;
}

export const POPUP_BROWSER_EXTENSION_EVENT = "NEW_BROWSER_EXTENSION_CONNECTION";
