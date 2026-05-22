# IIS reverse-proxy for AnythingLLM under `/ia/`

This document explains how to expose the locally-built AnythingLLM container
(see `docker/docker-compose.yml`) behind an existing IIS site, on a single FQDN,
under the sub-path `/ia/`.

The container itself is **already** built to answer on `/ia/` natively (Vite
`base`, React Router `basename`, Express `BASE_PATH`). IIS therefore only has
to do a transparent reverse proxy — no `outbound` rules, no content
rewriting, no `sub_filter`-style trickery.

If you ever need a different sub-path, edit two values in
`docker/docker-compose.yml` (`build.args.BASE_PATH` and `environment.BASE_PATH`)
and rebuild the image. The IIS rule below also has to be updated to match.

---

## 1. Architecture

```
Browser ──HTTPS──► IIS  ──HTTP loopback──►  BFF OIDC
        /ia/...     │      127.0.0.1:3003     /ia/api/...
                    │                          /ia/index.js
                    └─ URL Rewrite + ARR
                       (pass-through)
```

- IIS now targets the BFF at `127.0.0.1:3003` (see `docker-compose.yml`,
  `bff-oidc` service with `ports: "127.0.0.1:3003:3003"`).
- The BFF proxies validated traffic to AnythingLLM internally (`anything-llm:3001`).
- IIS rewrites any incoming `/ia(/...)` request to `http://127.0.0.1:3003/ia$1`,
  preserving path, query string and HTTP method. ARR forwards response bodies untouched.
- The frontend bundle, the API and the agent WebSocket are all served from
  the same origin (`/ia/...`), so there is no CORS to configure.

## 2. Prerequisites (one-off, on the IIS host)

These are the standard Microsoft components for a reverse-proxying IIS:

1. **URL Rewrite 2.1** —
   <https://www.iis.net/downloads/microsoft/url-rewrite>
2. **Application Request Routing 3.0** —
   <https://www.iis.net/downloads/microsoft/application-request-routing>
3. **WebSocket Protocol** Windows feature. Required for the agent invocation
   socket (`/ia/api/agent-invocation/...`). **Without it, IIS answers the
   upgrade request with a plain `200 OK` instead of `101 Switching Protocols`
   and the browser immediately closes the connection.**

   The feature name and the cmdlet to install it differ between Windows
   editions. Check your OS first:

   ```powershell
   (Get-CimInstance Win32_OperatingSystem).Caption
   ```

   - **Windows Server** (2016 / 2019 / 2022 / 2025) — uses `ServerManager`:

     ```powershell
     Get-WindowsFeature Web-WebSockets      # InstallState should be "Installed"
     Install-WindowsFeature Web-WebSockets  # if not
     ```

     GUI alternative: Server Manager → *Add Roles and Features* →
     *Web Server (IIS)* → *Web Server* → *Application Development* →
     **WebSocket Protocol**.

   - **Windows 10 / 11** (Pro or Enterprise — e.g. dev VM) — the
     `ServerManager` module does **not** exist here; use the optional-feature
     API instead:

     ```powershell
     Get-WindowsOptionalFeature -Online -FeatureName IIS-WebSockets
     # State should be "Enabled"

     Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebSockets -All
     # -All pulls in any missing dependencies automatically
     ```

     GUI alternative: *Windows Features* → *Internet Information Services* →
     *World Wide Web Services* → *Application Development Features* →
     **WebSocket Protocol**.

   Universal post-install check (works on any edition):

   ```powershell
   Test-Path "$env:windir\System32\inetsrv\iiswsock.dll"   # must be True
   Get-WebGlobalModule | Where-Object Name -like "*WebSocket*"
   # must list: WebSocketModule  %windir%\System32\inetsrv\iiswsock.dll
   ```

   An `iisreset` is generally not required (the Enable cmdlet returns
   `RestartNeeded : False`), but do one if the module does not show up in
   `Get-WebGlobalModule` right away.

Once ARR is installed, enable the proxy globally and tune it for streaming /
WebSocket (see §4 — this is **not** optional for this application):

- IIS Manager → top-level server node → *Application Request Routing Cache*
  → *Server Proxy Settings...* → check **Enable proxy** → *Apply*.

## 2bis. Application pool pipeline mode

The IIS site hosting the `/ia` rewrite rule MUST run its application pool in
**Integrated** pipeline mode. *Classic* mode does **not** propagate the
`Upgrade: websocket` / `Connection: Upgrade` headers through to ARR, and the
agent WebSocket silently fails with a `200 OK` response.

- IIS Manager → *Application Pools* → pool used by the site →
  *Basic Settings…* → **Managed pipeline mode = Integrated**.

This is the default for any pool created on IIS 7.5+, so it's usually already
correct, but it's cheap to verify and expensive to miss.

## 3. URL Rewrite rule (inbound only)

Add the following rule to the **site that already serves the FQDN**
(typically `Default Web Site` or whichever site hosts your other apps).
You can paste this directly into the site's `web.config`, inside the
`<system.webServer>` element. The rule is anchored on `^ia` so the rest of
the site (and any other `/appX` apps) keeps working unchanged.

```xml
<system.webServer>
  <rewrite>
    <rules>
      <rule name="AnythingLLM /ia reverse proxy" stopProcessing="true">
        <match url="^ia(/.*)?$" />
        <action type="Rewrite"
                url="http://127.0.0.1:3003/ia{R:1}"
                appendQueryString="true"
                logRewrittenUrl="true" />
      </rule>
    </rules>
  </rewrite>
</system.webServer>
```

Notes:

- `^ia(/.*)?$` matches both `/ia` (no trailing slash) and `/ia/anything`.
  The container redirects `/` to `/ia/` for usability, but it also accepts
  `/ia` directly thanks to `app.use("/ia", ...)`.
- `appendQueryString="true"` is mandatory — without it, login redirects with
  `?redirectTo=...` lose their query string.
- Forward `X-Forwarded-Proto: https` so the BFF can enforce secure cookies
  correctly when `BFF_TRUST_PROXY=true`.
- **No `outbound` rule** is needed. The container already produces correct
  HTML/JS references.

If you prefer the GUI: IIS Manager → site → *URL Rewrite* → *Add Rule(s)…* →
*Reverse Proxy*. Set inbound rule URL to `http://127.0.0.1:3003/`, then edit
the generated rule to match the pattern above.

## 4. ARR proxy settings (streaming + WebSocket)

LLM responses stream token-by-token over HTTP, and the agent invocation
endpoint is a WebSocket that stays open for the entire agent run (minutes,
not seconds). Tune ARR in *Application Request Routing Cache → Server Proxy
Settings…* on the **server** node (not the site node):

| Setting                         | Value                | Mandatory? | Reason |
|---------------------------------|----------------------|------------|--------|
| Enable proxy                    | ✅                    | Yes        | Otherwise reverse proxying is simply off. |
| **Time-out (seconds)**          | **`600`** (or more)  | **Yes — this is the one that fixes the WS failure observed under `/ia/api/agent-invocation/...`** | ARR's default is `30s`, applied to the whole connection, not idle time. A WebSocket opened via ARR is force-closed after 30 s → the browser sees the WS drop almost immediately after the `101` handshake. Raising to `600` (10 min) is enough in practice for agent sessions. |
| Keep alive                      | ✅                    | Yes        | Required to hold the WS tunnel open between browser ↔ IIS ↔ container. |
| HTTP version                    | `HTTP/1.1` / `Pass through` | Recommended | RFC 6455 requires HTTP/1.1 for the `Upgrade: websocket` handshake. Default is already fine in recent ARR builds; worth verifying. |
| Response buffer (KB)            | `0`                  | Recommended | Default `4096 KB` makes ARR hold the response body until the buffer fills, so the SSE/stream UI feels laggy (tokens arrive in bursts). Does **not** prevent the WS handshake itself. |
| Response buffer threshold (KB)  | `0`                  | Recommended | Same reason as above. |
| Enable disk cache               | ❌                    | Recommended | We don't want ARR caching API responses or the SPA bundle. |

In this deployment's field testing, raising **Time-out** from `30` → `600`
was sufficient on its own to make `wss://<FQDN>/ia/api/agent-invocation/...`
work reliably. The buffer settings are quality-of-life tweaks for the
streaming chat UI; they do not gate the WebSocket connection.

If you prefer PowerShell over the GUI, the minimum one-shot is:

```powershell
Import-Module WebAdministration

# 1. Make sure the ARR proxy is on.
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'enabled' -Value $true

# 2. THE critical one — raise the ARR proxy time-out from 30 s to 10 min.
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'timeout' -Value '00:10:00'

# 3. (Optional, for smoother streaming) disable response body buffering.
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' `
  -Filter 'system.webServer/proxy' -Name 'responseBufferLimit' -Value 0
```

Troubleshooting heuristics:

- **WebSocket fails only through the public FQDN, works on `localhost/ia`** →
  ARR time-out at its default `30s`. Raise to `600`. This is the single most
  common cause of the "WS works locally but not over IIS" report.
- **Streamed chat replies arrive in bursts instead of token-by-token** → ARR
  response buffers non-zero. Set both to `0`.
- **Truncated responses or `502 Bad Gateway` after ~30 s / 2 min** → same as
  the first bullet; raise the time-out.

## 5. Post-install verification

From the IIS host, with the stack running (`docker compose up -d` from `docker/`),
the following should all succeed:

```powershell
# 1. The BFF responds on /ia/healthz
curl.exe -i http://127.0.0.1:3003/ia/healthz

# 2. BFF redirects unauthenticated traffic to OIDC login
curl.exe -I http://127.0.0.1:3003/ia/

# 3. The internal app remains reachable locally on 3001 (debug only)
curl.exe -i http://127.0.0.1:3001/ia/api/ping

# 4. The OLD path is still a 404 on AnythingLLM (as intended)
curl.exe -i http://127.0.0.1:3001/api/ping
# Expected: HTTP/1.1 404 Not Found
```

From outside the host, through IIS:

```powershell
curl.exe -I https://<FQDN>/ia/
curl.exe -I https://<FQDN>/ia/index.js
curl.exe -i https://<FQDN>/ia/api/ping
```

**WebSocket-specific check** — forge a WS upgrade with `curl` and compare the
direct-to-container response with the through-IIS response. Both MUST answer
`HTTP/1.1 101 Switching Protocols`:

```powershell
# 1. Directly against the BFF (bypasses IIS). If this fails, the bug is
#    in BFF/container, not IIS.
curl.exe -i -N --http1.1 `
  -H "Connection: Upgrade" -H "Upgrade: websocket" `
  -H "Sec-WebSocket-Version: 13" `
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" `
  http://127.0.0.1:3003/ia/api/agent-invocation/probe

# 2. Through IIS/ARR. If (1) gives 101 but this does not, the bug is in the
#    IIS configuration (WebSocket feature, pool mode, or ARR buffering — see
#    §2, §2bis, §4).
curl.exe -i -N --http1.1 `
  -H "Connection: Upgrade" -H "Upgrade: websocket" `
  -H "Sec-WebSocket-Version: 13" `
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" `
  https://<FQDN>/ia/api/agent-invocation/probe
```

A `200 OK` response to #2 means the **WebSocket Protocol** Windows feature is
missing on the IIS host (§2). A `101` that closes after roughly 30 seconds
means the **ARR Time-out** is still at its default `30s` (§4) — this is the
failure mode we actually hit in production and it is fixed by raising the
time-out to `600`.

In a browser, opening `https://<FQDN>/ia/` should land you on the
AnythingLLM login or onboarding page; the DevTools Network tab should show
all XHR going to `/ia/api/...` and the agent WebSocket connecting to
`wss://<FQDN>/ia/api/agent-invocation/<uuid>` with status `101`.

## 6. Coexistence with other apps

The rule pattern (`^ia(/.*)?$`) is anchored: `/app1`, `/app2`, the bare site
root and any other path on the same FQDN are untouched and continue to be
served by IIS. Adding more applications later requires only their own rewrite
rule with a different prefix.

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `502 Bad Gateway` on `/ia/...` | Container down, or ARR proxy disabled. Check `docker compose ps` and the *Enable proxy* checkbox. |
| `404` on `/ia/index.js` | The image was built without `BASE_PATH=/ia/`. Force a rebuild: `docker compose build --no-cache anything-llm`. |
| Login works but the page is blank | Browser cached a previous build. Hard reload (`Ctrl+F5`) or empty `server/storage` cache. |
| Agent WebSocket returns `200 OK` instead of `101` | **WebSocket Protocol** Windows feature not installed on the IIS host (§2). Install `Web-WebSockets` on Server, or enable `IIS-WebSockets` via `Enable-WindowsOptionalFeature` on Windows 10/11. |
| Agent WebSocket fails only through the public FQDN, works on `localhost/ia` | **ARR proxy Time-out at its default `30s`** (§4). Raise to `600`. In practice this is the single cause we've hit on this deployment; check it first before anything else. |
| Agent WebSocket gets `101` then closes after ~30 s with no data | Same root cause as above — ARR Time-out too low (§4). |
| Streamed chat replies arrive in bursts, not token by token | ARR **Response buffer** / **Response buffer threshold** not zeroed (§4, optional). |
| `https://<FQDN>/ia/` opens but assets 404 from `https://<FQDN>/index.js` | The HTML was rendered without the BASE_PATH prefix. Rebuild the container — the build args were probably stale. |
| Cookies leak to other apps | Not applicable here: AnythingLLM stores its session token in `localStorage`, not cookies. Confirmed in `frontend/src/utils/constants.js`. |

## 8. Reverting

To revert to a domain-root deployment:

1. Edit `docker/docker-compose.yml`:
   - Set `build.args.BASE_PATH: /`
   - Remove (or empty out) `environment.BASE_PATH`
2. `docker compose build --no-cache anything-llm && docker compose up -d`
3. Remove the IIS rewrite rule.

The application falls back to its upstream behaviour automatically — the
sub-path is opt-in via `BASE_PATH`.
