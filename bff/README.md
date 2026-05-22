# AnythingLLM OIDC BFF

Ce BFF protège AnythingLLM derrière un flux de connexion OIDC (Keycloak ou tout fournisseur d'identité compatible OIDC), tout en conservant la compatibilité avec AnythingLLM upstream.

## Ce que fait ce service

- Termine le flux OIDC Authorization Code + PKCE.
- Crée/met à jour les utilisateurs AnythingLLM en juste-à-temps (JIT) via les API publiques d'administration.
- Émet un jeton SSO temporaire AnythingLLM puis redirige vers `/ia/sso/simple?token=...`.
- Proxifie tout le trafic `/ia/*` vers `anything-llm:3001` uniquement si la session BFF est valide.
- Effectue la déconnexion locale + la SLO Keycloak (`end_session_endpoint`).

## Routes exposées à l'exécution

- `GET /ia/auth/login`
- `GET /ia/auth/callback`
- `GET /ia/auth/logout`
- `GET /ia/auth/me`
- `GET /ia/healthz`
- `GET|POST|... /ia/*` (proxifié, session requise)

## Variables d'environnement requises

Copiez `docker/bff.env.example` vers `docker/bff.env` puis renseignez les valeurs.

```env
OIDC_ISSUER=https://keycloak.example.tld/realms/nautilus
OIDC_CLIENT_ID=anythingllm
OIDC_CLIENT_SECRET=change-me
OIDC_REDIRECT_URI=https://app.example.tld/ia/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=https://app.example.tld/ia/
OIDC_SCOPES=openid profile email

ROLE_CLAIM_SOURCE=realm_access.roles
ROLE_MAP_ADMIN=anythingllm-admin
ROLE_MAP_MANAGER=anythingllm-manager
SYNC_ROLES_ON_LOGIN=true

ANYTHINGLLM_BASE_URL=http://anything-llm:3001
ANYTHINGLLM_API_KEY=change-me
ANYTHINGLLM_BASE_PATH=/ia

BFF_PORT=3003
BFF_SESSION_SECRET=replace-with-32-bytes-minimum-secret
BFF_COOKIE_SECURE=true
BFF_COOKIE_DOMAIN=app.example.tld
BFF_TRUST_PROXY=true
LOG_LEVEL=info
```

## Configuration du client Keycloak

1. Créez un client OIDC confidentiel : `anythingllm`.
2. Activez le Standard Flow et PKCE (S256).
3. Désactivez Direct Access Grants et Service Accounts.
4. Définissez l'URI de redirection : `https://app.example.tld/ia/auth/callback`.
5. Définissez l'URI de redirection post-déconnexion : `https://app.example.tld/ia/`.
6. Définissez Web Origin : `https://app.example.tld`.
7. Vérifiez que `realm_access.roles` est présent dans l'ID token.
8. Créez les rôles de realm :
   - `nautilusllm-admin`
   - `nautilusllm-manager`
   - `nautilusllm-user`

## Clé API d'initialisation (premier déploiement)

`ANYTHINGLLM_API_KEY` est obligatoire pour le provisioning JIT. Générez-la depuis l'interface d'administration AnythingLLM avant d'activer le mode sans connexion :

1. Déployez AnythingLLM avec la connexion locale encore activée.
2. Connectez-vous avec un compte admin local.
3. Générez une clé API dans Admin > API Keys.
4. Ajoutez la clé dans `docker/bff.env` sous `ANYTHINGLLM_API_KEY`.
5. Activez dans `server/.env` :
   - `SIMPLE_SSO_ENABLED=true`
   - `SIMPLE_SSO_NO_LOGIN=true`

## Exécution en local

```bash
npm ci
npm start
```

Le BFF écoute sur `BFF_PORT` (par défaut `3003`).
