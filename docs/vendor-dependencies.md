# Vendor dependencies

This file tracks third-party dependencies that we cannot consume verbatim from
upstream and the reasons / patches that diverge from them. The goal, in the
spirit of `.kilo/rules/vendor-protection.md`, is to document each divergence
so we keep:

1. The list of files we have to replay on every upstream rebase.
2. The technical reason for the patch (so a future maintainer can decide
   whether the divergence is still warranted, or whether upstream has
   accepted the change).
3. An open-source alternative if we ever need to walk away from the
   dependency.

Each entry should be self-contained: the next person to upgrade
AnythingLLM should be able to read this file and reproduce the patches
without having to dig through git history.

---

## AnythingLLM (Mintplex-Labs/anything-llm)

| Field | Value |
|---|---|
| Upstream | <https://github.com/Mintplex-Labs/anything-llm> |
| Pinned version (this fork) | `1.12.1` (see `docker/Dockerfile`, `ENV DEPLOYMENT_VERSION`) |
| Licence | MIT |
| Type | Self-hosted, open source |
| Why we ship a fork | We need to mount the SPA + Express server under the sub-path `/ia/` so that IIS can publish multiple apps under one FQDN. Upstream supports a domain-root deployment only. |
| Open-source alternative | None at feature parity in the LLM-frontend space; the closest options (Open WebUI, LibreChat) cover only chat, not workspaces / RAG / agent flows. |
| Risk if upstream becomes unavailable | Low — we already build from source locally; we have the full repository checked out and can keep building until we choose a new vendor. |

### Patch set: `BASE_PATH`-aware build (sub-path deployment)

Goal: when the `BASE_PATH` env/build arg is set (e.g. `/ia`), the application
serves itself under that sub-path; when it is empty, the original
domain-root behaviour is preserved (zero regression for upstream-style
deployments).

The patches are deliberately small and isolated to make rebasing cheap. Each
of them is wrapped in a comment that starts with `[base-path]` so a `git
grep "\[base-path\]"` lists every divergence.

| File | Nature of the change |
|---|---|
| `frontend/vite.config.js` | Adds `base: process.env.VITE_BASE_URL \|\| '/'` so Vite produces asset URLs under the sub-path. |
| `frontend/src/main.jsx` | Wires the React Router `basename` from `import.meta.env.BASE_URL` (auto-filled by Vite). |
| `frontend/src/utils/paths.js` | Introduces a `withBase()` named export. **Path-returning functions are intentionally NOT prefixed** — React Router auto-prepends the basename to `<Link to>` / `useNavigate` and pre-prefixing would cause double prefixes (verified against react-router-dom v6 source). Raw `<a href>` tags however **bypass React Router** (they write straight into the URL bar, like `window.location.*`) and must be wrapped explicitly with `withBase()` at the call site. |
| `frontend/src/utils/chat/agent.js` | Bug fix: `websocketURI()` would throw for any relative `VITE_API_BASE` (e.g. `/ia/api`). Now any leading `/` is treated as same-origin. |
| `frontend/src/utils/constants.js` | Bug fix: `fullApiUrl()` would return a bare relative path when `API_BASE === "/ia/api"`, breaking every `new URL(fullApiUrl() + ...)` call site (`models/system.js`, `models/workspace.js`, browser-extension API key helpers). |
| `frontend/src/components/WorkspaceChat/ChatContainer/index.jsx` | The agent WebSocket URL was hardcoded as `/api/...`; now built from `API_BASE` so it tracks the API mount point. |
| `frontend/src/components/Sidebar/SidebarToggle/index.jsx` | Replaces `window.location.pathname` (includes the basename) with React Router's `useLocation()` (basename-stripped) so the sidebar toggle visibility regex still matches. |
| `frontend/src/utils/keyboardShortcuts.js`, `frontend/src/components/CanViewChatHistory/index.jsx`, `frontend/src/components/Modals/Password/{SingleUserAuth,MultiUserAuth}.jsx`, `frontend/src/components/Modals/NewWorkspace.jsx`, `frontend/src/components/Sidebar/ActiveWorkspaces/ThreadContainer/index.jsx`, `frontend/src/components/Sidebar/ActiveWorkspaces/ThreadContainer/ThreadItem/index.jsx`, `frontend/src/components/UserMenu/UserButton/index.jsx`, `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx`, `frontend/src/pages/GeneralSettings/Security/index.jsx`, `frontend/src/pages/Invite/NewUserModal/index.jsx`, `frontend/src/pages/Login/SSO/simple.jsx`, `frontend/src/pages/WorkspaceSettings/GeneralAppearance/DeleteWorkspace/index.jsx` | Wrap every `window.location.(href \| replace \| assign) = paths.xxx()` (and `window.location = ...`) with `withBase()` because these calls bypass React Router and write to the URL bar directly. |
| `frontend/src/pages/Admin/Invitations/{NewInviteModal,InviteRow}/index.jsx` | Invite links are shared externally; prefix with `withBase("/accept-invite/<code>")` so the URL still resolves through the IIS rewrite. |
| `frontend/src/components/Sidebar/ActiveWorkspaces/{index,ThreadContainer/ThreadItem/index}.jsx`, `frontend/src/components/WorkspaceChat/index.jsx`, `frontend/src/components/SettingsSidebar/index.jsx`, `frontend/src/components/LLMSelection/{LocalAiOptions,LMStudioOptions}/index.jsx`, `frontend/src/pages/WorkspaceSettings/AgentConfig/index.jsx`, `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/{EmbedConfigs/EmbedRow,EmbedChats/ChatRow}/index.jsx`, `frontend/src/pages/Admin/{Workspaces/WorkspaceRow,ExperimentalFeatures}/index.jsx`, `frontend/src/pages/GeneralSettings/CommunityHub/ImportItem/Steps/Introduction/index.jsx` | Wrap every internal `<a href={paths.xxx()}>` with `withBase()`. Raw `<a>` tags bypass React Router's `basename`, so without this every sidebar / settings link would render as `/workspace/...` instead of `/ia/workspace/...` and click-throughs would 404 against the IIS rewrite. The `ThreadItem` patch also fixes the `window.location.pathname === linkTo` comparison so the active-thread `"#"` guard still matches under sub-path. |
| `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedConfigs/EmbedRow/CodeSnippetModal/index.jsx` | Embed widget snippet (rendered into third-party sites) now references `<host>/ia/embed/anythingllm-chat-widget.min.js` and `<host>/ia/api/embed`. |
| `server/utils/basePath.js` (**new**) | Shared `BASE_PATH` / `joinBase()` helper. Single source of truth on the server side. |
| `server/index.js` | Mounts `apiRouter` at `joinBase("/api")`; serves the static bundle at `BASE_PATH || "/"`; prefixes `/robots.txt`, `/manifest.json`, the SPA catch-all; redirects `/` → `/ia/` when a sub-path is active. |
| `server/utils/boot/MetaGenerator.js` | Prefixes every internal HTML reference (`/index.js`, `/index.css`, `/favicon.png`, `/manifest.json`, PWA `start_url`). User-supplied URLs (custom favicon) remain untouched. |
| `server/swagger/utils.js` | Mounts the swagger UI at `joinBase("/api/docs")` (otherwise the docs page is missing under sub-path deployments). |
| `server/models/mobileDevice.js` | `connectionURL()` now returns `joinBase("/api/mobile")`, so the QR code shown to mobile users embeds the correct sub-path. |
| `docker/Dockerfile` | Adds `ARG BASE_PATH` + relevant `ENV`s in **both** the `frontend-build` stage (Vite picks up `VITE_BASE_URL` / `VITE_API_BASE`) and the `production-build` stage (Express picks up `BASE_PATH`). |
| `docker/docker-compose.yml` | Pins `build.args.BASE_PATH=/ia/` (Vite needs the trailing slash) and `environment.BASE_PATH=/ia` (Express convention, no trailing slash). Restricts the port binding to `127.0.0.1:3001:3001` so only IIS reaches the container. |

The IIS-side configuration that matches these patches is documented in
`IIS_SETUP.md` (project root).

### Rebase procedure on a future AnythingLLM upgrade

1. `git remote add upstream https://github.com/Mintplex-Labs/anything-llm.git`
   (one-off).
2. `git fetch upstream`.
3. Branch off the new tag: `git checkout -b rebase/<new-tag> upstream/<new-tag>`.
4. Cherry-pick or replay the `[base-path]` commits onto the new branch.
   `git grep "\[base-path\]"` on the previous branch lists every line we
   need to keep.
5. Run the §6.1 / §6.2 smoke tests from the original
   `.kilo/plans/1777982150590-gentle-knight.md` plan.
6. If any newly-introduced upstream code hardcodes `/api`, `/index.js`,
   `/favicon.png`, or builds URLs with `paths.xxx()` outside React Router,
   add a corresponding `[base-path]` patch and document it here.
7. Bump the *Pinned version* line at the top of this entry.

### Upstream-friendliness

We did **not** push these patches to <https://github.com/Mintplex-Labs/anything-llm>:
the deployment is internal only, and pursuing an upstream PR is not in
scope for this project. The patches are nonetheless self-contained and
behaviour-preserving (everything no-ops when `BASE_PATH` is empty), so they
remain easy to extract and submit upstream later if the policy changes.
