# Dépendances tierces

Ce fichier suit les dépendances tierces que nous ne pouvons pas consommer telles quelles depuis l'amont et les raisons / correctifs qui divergent d'elles. L'objectif, dans l'esprit de `.kilo/rules/vendor-protection.md`, est de documenter chaque divergence afin que nous conservions :

1. La liste des fichiers que nous devons rejouer à chaque rebase en amont.
2. La raison technique du correctif (afin qu'un futur mainteneur puisse décider si la divergence est toujours justifiée, ou si l'amont a accepté le changement).
3. Une alternative open-source si nous devons un jour abandonner la dépendance.

Chaque entrée doit être autonome : la prochaine personne à mettre à niveau AnythingLLM doit pouvoir lire ce fichier et reproduire les correctifs sans avoir à fouiller dans l'historique git.

---

## AnythingLLM (Mintplex-Labs/anything-llm)

| Champ | Valeur |
|---|---|
| Amont | <https://github.com/Mintplex-Labs/anything-llm> |
| Version épinglée (ce fork) | `1.12.1` (voir `docker/Dockerfile`, `ENV DEPLOYMENT_VERSION`) |
| Licence | MIT |
| Type | Auto-hébergé, open source |
| Pourquoi nous expédions un fork | Nous devons monter le SPA + le serveur Express sous le sous-chemin `/ia/` afin que IIS puisse publier plusieurs applications sous un seul FQDN. L'amont ne supporte qu'un déploiement à la racine du domaine. |
| Alternative open-source | Aucune à parité de fonctionnalités dans l'espace LLM-frontend ; les options les plus proches (Open WebUI, LibreChat) ne couvrent que le chat, pas les espaces de travail / RAG / flux d'agents. |
| Risque si l'amont devient indisponible | Faible — nous construisons déjà à partir de la source localement ; nous avons le dépôt complet extrait et pouvons continuer à construire jusqu'à ce que nous choisissions un nouveau fournisseur. |

### Ensemble de correctifs : construction consciente de `BASE_PATH` (déploiement sous-chemin)

Objectif : lorsque l'argument env/build `BASE_PATH` est défini (par exemple `/ia`), l'application se sert elle-même sous ce sous-chemin ; lorsqu'il est vide, le comportement original de la racine du domaine est préservé (zéro régression pour les déploiements de style amont).

Les correctifs sont délibérément petits et isolés pour rendre le rebase peu coûteux. Chacun d'eux est enveloppé dans un commentaire qui commence par `[base-path]` afin qu'un `git grep "\[base-path\]"` liste chaque divergence.

| Fichier | Nature du changement |
|---|---|
| `frontend/vite.config.js` | Ajoute `base: process.env.VITE_BASE_URL || '/'` pour que Vite produise des URL d'actifs sous le sous-chemin. |
| `frontend/src/main.jsx` | Connecte le `basename` de React Router depuis `import.meta.env.BASE_URL` (rempli automatiquement par Vite). |
| `frontend/src/utils/paths.js` | Introduit une exportation nommée `withBase()`. **Les fonctions retournant des chemins ne sont intentionnellement PAS préfixées** — React Router pré-préfixe automatiquement le basename à `<Link to>` / `useNavigate` et un pré-préfixage causerait des doubles préfixes (vérifié contre la source react-router-dom v6). Les balises `<a href>` brutes, en revanche, **contournent React Router** (elles écrivent directement dans la barre d'URL, comme `window.location.*`) et doivent être explicitement enveloppées avec `withBase()` au point d'usage. |
| `frontend/src/utils/chat/agent.js` | Correction de bug : `websocketURI()` jetterait une erreur pour tout `VITE_API_BASE` relatif (par exemple `/ia/api`). Maintenant, tout `/` initial est traité comme same-origin. |
| `frontend/src/utils/constants.js` | Correction de bug : `fullApiUrl()` retournerait un chemin relatif nu lorsque `API_BASE === "/ia/api"`, cassant chaque appel de site `new URL(fullApiUrl() + ...)` (`models/system.js`, `models/workspace.js`, helpers de clé API de l'extension navigateur). |
| `frontend/src/components/WorkspaceChat/ChatContainer/index.jsx` | L'URL WebSocket de l'agent était codée en dur comme `/api/...` ; maintenant construite à partir de `API_BASE` pour qu'elle suive le point de montage de l'API. |
| `frontend/src/components/Sidebar/SidebarToggle/index.jsx` | Remplace `window.location.pathname` (inclut le basename) par `useLocation()` de React Router (basename supprimé) pour que l'expression régulière de visibilité du basculement de la barre latérale corresponde toujours. |
| `frontend/src/utils/keyboardShortcuts.js`, `frontend/src/components/CanViewChatHistory/index.jsx`, `frontend/src/components/Modals/Password/{SingleUserAuth,MultiUserAuth}.jsx`, `frontend/src/components/Modals/NewWorkspace.jsx`, `frontend/src/components/Sidebar/ActiveWorkspaces/ThreadContainer/index.jsx`, `frontend/src/components/Sidebar/ActiveWorkspaces/ThreadContainer/ThreadItem/index.jsx`, `frontend/src/components/UserMenu/UserButton/index.jsx`, `frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/index.jsx`, `frontend/src/pages/GeneralSettings/Security/index.jsx`, `frontend/src/pages/Invite/NewUserModal/index.jsx`, `frontend/src/pages/Login/SSO/simple.jsx`, `frontend/src/pages/WorkspaceSettings/GeneralAppearance/DeleteWorkspace/index.jsx` | Enveloppe chaque `window.location.(href | replace | assign) = paths.xxx()` (et `window.location = ...`) avec `withBase()` car ces appels contournent React Router et écrivent directement dans la barre d'URL. |
| `frontend/src/pages/Admin/Invitations/{NewInviteModal,InviteRow}/index.jsx` | Les liens d'invitation sont partagés externement ; préfixe avec `withBase("/accept-invite/<code>")` pour que l'URL se résolve toujours via la réécriture IIS. |
| `frontend/src/components/Sidebar/ActiveWorkspaces/{index,ThreadContainer/ThreadItem/index}.jsx`, `frontend/src/components/WorkspaceChat/index.jsx`, `frontend/src/components/SettingsSidebar/index.jsx`, `frontend/src/components/LLMSelection/{LocalAiOptions,LMStudioOptions}/index.jsx`, `frontend/src/pages/WorkspaceSettings/AgentConfig/index.jsx`, `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/{EmbedConfigs/EmbedRow,EmbedChats/ChatRow}/index.jsx`, `frontend/src/pages/Admin/{Workspaces/WorkspaceRow,ExperimentalFeatures}/index.jsx`, `frontend/src/pages/GeneralSettings/CommunityHub/ImportItem/Steps/Introduction/index.jsx` | Enveloppe chaque `<a href={paths.xxx()}>` interne avec `withBase()`. Les balises `<a>` brutes contournent le `basename` de React Router : sans cela, chaque lien de la barre latérale / des paramètres se rendrait en `/workspace/...` au lieu de `/ia/workspace/...` et les clics retourneraient un 404 contre la réécriture IIS. Le patch de `ThreadItem` corrige aussi la comparaison `window.location.pathname === linkTo` afin que le garde `"#"` (thread actif) corresponde toujours sous sous-chemin. |
| `frontend/src/pages/GeneralSettings/ChatEmbedWidgets/EmbedConfigs/EmbedRow/CodeSnippetModal/index.jsx` | L'extrait de widget intégré (rendu dans des sites tiers) fait maintenant référence à `<host>/ia/embed/anythingllm-chat-widget.min.js` et `<host>/ia/api/embed`. |
| `server/utils/basePath.js` (**nouveau**) | Helper `BASE_PATH` / `joinBase()` partagé. Source unique de vérité côté serveur. |
| `server/index.js` | Monte `apiRouter` à `joinBase("/api")` ; sert le bundle statique à `BASE_PATH || "/"` ; préfixe `/robots.txt`, `/manifest.json`, le catch-all SPA ; redirige `/` → `/ia/` lorsqu'un sous-chemin est actif. |
| `server/utils/boot/MetaGenerator.js` | Préfixe chaque référence HTML interne (`/index.js`, `/index.css`, `/favicon.png`, `/manifest.json`, PWA `start_url`). Les URL fournies par l'utilisateur (favicon personnalisée) restent inchangées. |
| `server/swagger/utils.js` | Monte l'UI swagger à `joinBase("/api/docs")` (sinon la page de documentation est manquante sous les déploiements de sous-chemin). |
| `server/models/mobileDevice.js` | `connectionURL()` retourne maintenant `joinBase("/api/mobile")`, afin que le code QR montré aux utilisateurs mobiles intègre le sous-chemin correct. |
| `docker/Dockerfile` | Ajoute `ARG BASE_PATH` + `ENV` pertinents dans **les deux** étapes `frontend-build` (Vite récupère `VITE_BASE_URL` / `VITE_API_BASE`) et `production-build` (Express récupère `BASE_PATH`). |
| `docker/docker-compose.yml` | Épingle `build.args.BASE_PATH=/ia/` (Vite a besoin du slash final) et `environment.BASE_PATH=/ia` (convention Express, pas de slash final). Restreint la liaison de port à `127.0.0.1:3001:3001` pour que seul IIS atteigne le conteneur. |

La configuration côté IIS qui correspond à ces correctifs est documentée dans `IIS_SETUP.md` (racine du projet).

### Procédure de rebase lors d'une future mise à niveau d'AnythingLLM

1. `git remote add upstream https://github.com/Mintplex-Labs/anything-llm.git` (une seule fois).
2. `git fetch upstream`.
3. Créer une branche à partir de la nouvelle étiquette : `git checkout -b rebase/<new-tag> upstream/<new-tag>`.
4. Cherry-picker ou rejouer les commits `[base-path]` sur la nouvelle branche. `git grep "\[base-path\]"` sur la branche précédente liste chaque ligne que nous devons conserver.
5. Exécuter les tests de fumée §6.1 / §6.2 du plan original `.kilo/plans/1777982150590-gentle-knight.md`.
6. Si un code nouvellement introduit en amont code en dur `/api`, `/index.js`, `/favicon.png`, ou construit des URL avec `paths.xxx()` en dehors de React Router, ajouter un correctif `[base-path]` correspondant et le documenter ici.
7. Incrémenter la ligne *Version épinglée* en haut de cette entrée.

### Compatibilité avec l'amont

Nous n'avons **pas** poussé ces correctifs vers <https://github.com/Mintplex-Labs/anything-llm> : le déploiement est interne uniquement, et la poursuite d'une PR en amont n'est pas dans le cadre de ce projet. Les correctifs sont néanmoins autonomes et préservent le comportement (tout ne fait rien lorsque `BASE_PATH` est vide), ils restent donc faciles à extraire et à soumettre en amont plus tard si la politique change.