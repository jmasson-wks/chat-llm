# Architecture - OIDC via BFF Node.js

Ce document archive le plan d'implementation de `.kilo/plans/1779376925696-eager-cabin.md` et decrit l'architecture livree.

## Decisions finales

- Source du mapping des roles : Keycloak `realm_access.roles`.
- Mode de deconnexion : deconnexion locale du BFF + SLO Keycloak (`end_session_endpoint`).
- Mode de provisionnement : JIT a la premiere connexion.
- Stockage de session BFF : cookie stateless signe (`cookie-session`).
- Regle de prefixe de methode `IWS` : non appliquee (le BFF est en JavaScript ; la regle cible .NET).

## Schema de deploiement

```mermaid
flowchart LR
    User([Utilisateur]) -->|HTTPS /ia/*| IIS[IIS Reverse Proxy]
    IIS -->|http 127.0.0.1:3003| BFF[BFF OIDC Node.js :3003]
    BFF -.->|OIDC Authorization Code + PKCE| KC[(Keycloak)]
    BFF -->|API key REST| Server
    BFF -->|proxy HTTP + WS| Frontend

    subgraph anythingllm[Stack docker-compose anythingllm]
        Frontend[anythingllm frontend/server :3001]
        Server[AnythingLLM API]
        DB[(PostgreSQL)]
        Qdrant[(Qdrant)]
        Server --> DB
        Server --> Qdrant
    end
```

## Sequence de connexion

```mermaid
sequenceDiagram
    participant U as Navigateur
    participant BFF as BFF Node.js
    participant KC as Keycloak
    participant API as AnythingLLM API
    participant FE as AnythingLLM frontend

    U->>BFF: GET /ia/
    BFF-->>U: 302 /ia/auth/login (if no session)
    U->>BFF: GET /ia/auth/login
    BFF-->>U: 302 Keycloak authorize (PKCE + state + nonce)
    U->>KC: Authentification
    KC-->>U: 302 /ia/auth/callback?code&state
    U->>BFF: GET /ia/auth/callback
    BFF->>KC: token exchange
    BFF->>API: list/create/update user (JIT)
    BFF->>API: issue temporary SSO token
    BFF-->>U: 302 /ia/sso/simple?token=...
    U->>FE: GET /ia/sso/simple?token=...
    FE->>API: exchange token -> app JWT
    FE-->>U: redirected to app with active session
```

## Sequence de deconnexion (SLO)

```mermaid
sequenceDiagram
    participant U as Navigateur
    participant FE as Frontend
    participant BFF as BFF
    participant KC as Keycloak

    U->>FE: Clique sur deconnexion
    FE->>FE: clear localStorage token/user
    FE-->>U: redirect /ia/auth/logout
    U->>BFF: GET /ia/auth/logout
    BFF->>BFF: clear BFF cookie session
    BFF-->>U: 302 Keycloak end_session_endpoint
    KC-->>U: 302 /ia/
```

## Notes

- Le serveur AnythingLLM n'a pas ete fork. L'integration utilise les API publiques existantes ainsi que le passthrough Simple SSO existant.
- La cible IIS a ete changee vers `127.0.0.1:3003` (BFF), tandis que `127.0.0.1:3001` reste utilise pour le local/debug.
- La coherence de `BASE_PATH=/ia` est requise entre AnythingLLM, les routes du BFF et les URI de redirection Keycloak.
