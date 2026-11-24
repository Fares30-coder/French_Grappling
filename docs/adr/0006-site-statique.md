# ADR 0006 — Site public statique, API et éditeur en local seulement

- Statut : accepté (validé par Fares le 2026-11-24)
- Date : 2026-11-24
- Auteur : agent architecte (pour Fares Haouari)
- Portée : phase 3, lot 8 (`docs/plan-phase-3.md`), mise en ligne
- Remplace : ADR 0005 (VPS OVH), qui passera à « remplacé par 0006 » à l'acceptation et reste le **plan de repli** (D7)
- Dépend de : ADR 0002 (contrats Zod, format de pose), ADR 0003 (admin, CSP), ADR 0004 (frontière 3D)

## Contexte

Décision de Fares du 2026-11-24 : **aucun abonnement** (ni clubs ni pratiquants). Les seuls revenus sont la colonne de pub (`features/ads` : sponsor direct, sinon AdSense, sinon « Devenir sponsor »). Il n'y a donc en ligne ni compte, ni paiement, ni écriture : le site public n'a besoin d'aucun serveur. L'ADR 0005 (VPS, Docker, PostgreSQL, sauvegardes, déploiement SSH) devient une charge d'exploitation sans contrepartie.

État réel du code (vérifié le 2026-11-24, branche `feat/deploy-ovh`) :

- Lectures publiques : `use-catalog.ts` (`/api/techniques` sans paramètre, `/api/positions`), `use-technique.ts` (`/api/techniques/:slug`, 404 géré), `MapPage.tsx` (`/api/graph`), via `fetchJson` (`lib/api.ts`) et des schémas de `@tatamap/shared` (`techniqueListSchema`, `techniqueDetailSchema`, `positionListSchema`, `graphSchema`, `tagListSchema`).
- Le filtrage de la bibliothèque est **déjà côté client** : la liste est chargée entière, `techniqueMatchesQuery` / `matchesSearch` vivent dans `packages/shared/src/catalog.ts`. Rien à déplacer.
- Côté API, les réponses publiques sont produites par `catalog/catalog-repository.ts` + `catalog/to-catalog.ts` et `techniques/technique-repository.ts` + `techniques/to-technique-detail.ts` (techniques publiées seulement, poses passées par `upgradePose`, sortie validée par Zod).
- `content:export` / `content:import` (`apps/api/src/content/content-io.ts`) font l'aller-retour base ↔ `content/` (clone du repo privé `tatamap-content`) ; l'import valide tout puis fait un upsert par slug.
- Le front : routes admin et `/dev` en `lazy` ; `lib/admin-isolation.ts` recharge la page en entrant dans `/admin` et n'injecte jamais AdSense sous `/admin` ; `vite.config.ts` pose un nonce fictif (`html.cspNonce`, actuellement une action de template Caddy) et émet `ads.txt` si `VITE_ADSENSE_CLIENT` est défini. `fighter.v3.glb` : 972 Ko, sans Draco.
- La CI (`ci.yml`) a déjà une base PostgreSQL jetable (`migrate deploy`, seed, tests, build).

AdSense : Google ne prend en charge **que la CSP stricte à nonce** ; la directive qu'il documente est `script-src 'nonce-{random}' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic' https: http:` (l'ADR 0005 avait omis `'unsafe-eval'`). Liste de domaines : non prise en charge. Hash : non mentionné ([AdSense, aide](https://support.google.com/adsense/answer/16283098)). Un nonce par réponse exige un bout de code exécuté à chaque chargement de page HTML.

## Hébergeurs comparés (vérifié le 2026-11-24)

| Option | Coût | Nonce CSP par requête | Remarques |
| --- | --- | --- | --- |
| **Cloudflare Workers, static assets** (+ un petit Worker) | 0 € (plan gratuit) | oui (Worker + `HTMLRewriter`) | Requêtes vers les fichiers statiques gratuites et illimitées ; Worker : 100 000 requêtes/jour sur le plan gratuit, au-delà réponse **429** (pas de repli sur le statique) ; 20 000 fichiers par version, 25 Mio par fichier. Cloudflare recommande désormais Workers plutôt que Pages pour un nouveau projet (Pages reste supporté). Société américaine (Data Privacy Framework). Sources : [limites](https://developers.cloudflare.com/workers/platform/limits/), [facturation des assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations), [migrer depuis Pages](https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/), [changelog 2025-09-02](https://developers.cloudflare.com/changelog/post/2025-09-02-increased-static-asset-limits/) |
| Cloudflare Pages + Pages Functions | 0 € | oui | Même chose, produit que Cloudflare ne pousse plus pour les nouveaux projets. |
| Hébergement web OVH (Perso) | promo vue à 3,59 € TTC/mois, renouvellement 5,99 € HT/mois ; **gamme refondue en mai 2026, prix actuel non confirmé** | seulement par un `index.php` | En France. En-têtes par `.htaccess`. Sans PHP : CSP par liste de domaines (non prise en charge par AdSense) ou relâchée. Déploiement FTP/SSH. Sources : [OVH hébergement web](https://ovhcloud.com/fr/web-hosting/), [OVH, évolution des offres](https://blog.ovhcloud.com/?p=30639) |
| GitHub Pages | 0 € | non | Pas d'en-têtes HTTP personnalisés (ni CSP en en-tête, ni `frame-ancestors`) : écarté. |

## Décision

**Le site public devient 100 % statique, servi par Cloudflare Workers (static assets) avec un Worker de quelques dizaines de lignes qui ne sert qu'à poser le nonce CSP sur les pages HTML. L'API Fastify, PostgreSQL, l'admin et l'éditeur de poses ne tournent plus qu'en local et ne sont jamais exposés. Le contenu publié est transformé en JSON statiques par la CI, à partir du repo privé `tatamap-content`.** Coût : 0 € par mois, plus le domaine.

Pourquoi Cloudflare plutôt qu'OVH : c'est la seule option gratuite qui donne la CSP que Google prend en charge sans faire du PHP dans un projet TypeScript, avec un CDN pour le `.glb` et un déploiement par une commande (`wrangler deploy`). L'argument « hébergé en France » est faible pour un site sans compte, sans formulaire et dont la pub passe de toute façon par Google. Compromis assumés : fournisseur américain (à écrire dans les mentions légales et la politique de confidentialité), plafond de 100 000 pages HTML servies par jour (largement au-dessus du trafic visé ; au-delà, Workers Paid à 5 $/mois).

### D1. Ce qui est en ligne, ce qui reste en local

```
En ligne (https://tatamap.fr, Cloudflare)          En local (ordinateur de Fares)
  Worker (HTML seulement : nonce + CSP)              apps/api (Fastify) + PostgreSQL (docker-compose)
  /index.html, /assets/*  (build Vite)               apps/web en dev : bibliothèque + admin + éditeur
  /models/fighter.v3.glb                             content/ (clone de tatamap-content, source de vérité)
  /data/v1/*.json         (contenu publié)
  /ads.txt, /_headers
```

- Plus aucune route `/api/*` en ligne, plus de cookie, plus de session : l'isolement admin/AdSense (`admin-isolation.ts`) devient une défense en profondeur locale, gardée car elle ne coûte rien.
- Le build « site » **ne contient pas l'admin** : les routes `/admin*` sont retirées par une constante de build, comme `devRoutes` (`import.meta.env.DEV`). Un test de la CI vérifie qu'aucun fichier de `dist/` ne contient `/api/admin`.

### D2. Contrat des JSON statiques

Les fichiers reprennent **exactement** les réponses publiques actuelles, validées par les mêmes schémas de `@tatamap/shared` :

| Fichier | Équivaut à | Schéma |
| --- | --- | --- |
| `/data/v1/techniques.json` | `GET /api/techniques` (sans filtre) | `techniqueListSchema` |
| `/data/v1/techniques/<slug>.json` | `GET /api/techniques/:slug` | `techniqueDetailSchema` |
| `/data/v1/positions.json` | `GET /api/positions` | `positionListSchema` |
| `/data/v1/graph.json` | `GET /api/graph` | `graphSchema` |
| `/data/v1/tags.json` | `GET /api/tags` | `tagListSchema` |

- `v1` versionne l'enveloppe (listes, détail), pas la pose : la pose garde son propre versionnement par `skeleton` (`upgradePose`). L'export écrit toujours le squelette courant. Une app mobile future lira les mêmes fichiers.
- Seules les techniques **publiées** sont exportées ; les slugs (déjà contraints par `slug.ts`) sont des noms de fichiers sûrs.
- Générés par `apps/api/scripts/site-export.ts` (`pnpm site:export`), qui appelle **les mêmes fonctions** que les routes publiques (repository + `to-catalog` / `to-technique-detail`) : zéro mapping dupliqué. Le contenu passe donc par une base PostgreSQL (jetable en CI, locale chez Fares), au lieu d'un second mapping depuis les fichiers de `content/`.

### D3. Couche d'accès aux données du front

Un seul module, `apps/web/src/lib/public-data.ts`, connaît les URL publiques ; les hooks (`use-catalog`, `use-technique`, `MapPage`) l'appellent au lieu d'écrire `/api/...`. Les clés TanStack Query ne changent pas.

```ts
// apps/web/src/lib/public-data.ts (sketch for dev)
export type PublicResource =
  | { kind: 'techniques' }
  | { kind: 'technique'; slug: string }
  | { kind: 'positions' }
  | { kind: 'graph' }
  | { kind: 'tags' };

/** Build-time constant: 'static' for the deployed site, 'api' (default) for local dev. */
const STATIC = import.meta.env.VITE_DATA_SOURCE === 'static';

export function publicUrl(r: PublicResource): string {
  const slug = r.kind === 'technique' ? encodeURIComponent(r.slug) : '';
  if (STATIC) return r.kind === 'technique' ? `/data/v1/techniques/${slug}.json` : `/data/v1/${r.kind}.json`;
  return r.kind === 'technique' ? `/api/techniques/${slug}` : `/api/${r.kind}`;
}
```

- `fetchJson` et la validation Zod restent tels quels. En mode statique, une 404 doit devenir `ApiRequestError(404, 'not_found')` (aujourd'hui un 404 sans corps JSON d'erreur devient `internal`) : petit ajustement de `send()`, avec un test, sinon la page « technique introuvable » ne s'affiche plus.
- Le repli SPA de l'hébergeur ne doit **jamais** répondre `index.html` sur `/data/*` (une 200 en HTML ferait échouer la validation au lieu d'une 404) : vérifié dans le lot 4.
- Dev local inchangé : `pnpm dev` = mode `api`, proxy Vite vers Fastify, admin et éditeur sur l'API. `pnpm site:preview` (build `static` + `site:export` depuis la base locale + `wrangler dev`) sert à tester le site tel qu'en ligne, Worker et en-têtes compris.
- Le viewer reste un composant unique ; il ne sait rien de la provenance des poses.

### D4. Publication et source du contenu en CI

Le repo de code est public : le contenu n'y est **jamais** commité, et rien de `content/` n'est versionné ici.

1. Fares publie dans l'éditeur local, puis `pnpm content:export`, commit et push dans `tatamap-content` (comme aujourd'hui).
2. Il lance le workflow **`site`** (`workflow_dispatch` ; aussi sur push vers `main` du repo de code).
3. Le job, dans l'environnement GitHub `production` (branche `main` seulement) :
   - checkout du code, puis checkout de `tatamap-content` dans `content/` avec une **clé de déploiement en lecture seule** propre à ce repo (secret `CONTENT_DEPLOY_KEY`) ; un PAT à grain fin limité à `contents:read` sur ce seul repo convient aussi ;
   - base PostgreSQL jetable (service, comme le job `check`), `prisma migrate deploy`, `pnpm content:import` (techniques, positions, tags ; jamais `marketing/`) ;
   - `VITE_DATA_SOURCE=static VITE_ADSENSE_CLIENT=… pnpm --filter @tatamap/web build`, puis `pnpm site:export` vers `apps/web/dist/data/v1/` ;
   - contrôles : chaque JSON revalidé par son schéma, nombre de techniques publiées > 0, aucun `/api/admin` dans `dist/`, aucun fichier hors de `dist/` ajouté au dépôt ;
   - `wrangler deploy` avec `CLOUDFLARE_API_TOKEN` (jeton limité à *Workers Scripts: Edit* sur le compte) et `CLOUDFLARE_ACCOUNT_ID`.
4. **Pas d'`upload-artifact`** de `dist/` ni de `content/` : les artefacts d'un repo public sont téléchargeables. Les journaux n'impriment que des compteurs, pas de contenu.

Le contenu publié est de toute façon public une fois en ligne ; ce qui est protégé, ce sont les brouillons, `marketing/` et l'historique du repo privé.

Pourquoi la CI plutôt qu'un déploiement depuis l'ordinateur de Fares : un déploiement reproductible depuis `main` + un commit de contenu poussé, sans dépendre d'un arbre local sale. Le `wrangler deploy` local reste possible en dépannage.

Retour arrière : `wrangler rollback` (versions conservées par Cloudflare) ou relancer le workflow sur un commit précédent.

### D5. Sécurité

- **Worker** (`apps/web/edge/worker.ts`, avec `apps/web/wrangler.jsonc`) : invoqué seulement pour les navigations HTML (`assets.run_worker_first` sur `/*` en excluant `/assets/*`, `/data/*`, `/models/*`, `/ads.txt` et les icônes ; syntaxe d'exclusion à vérifier avec la version de wrangler), `not_found_handling: "single-page-application"`. Il lit `index.html` depuis le binding `ASSETS`, génère un nonce (`crypto.getRandomValues`, 16 octets, base64), remplace le nonce fictif par `HTMLRewriter` sur les attributs `nonce`, et pose la CSP et les autres en-têtes. La logique est une fonction pure testée par Vitest. `html.cspNonce` passe d'une action de template Caddy à une valeur fixe (`__CSP_NONCE__`).
- **CSP des pages HTML** (AdSense actif) : `script-src 'nonce-…' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`. `'unsafe-eval'` n'est ajouté que si les rapports Report-Only montrent qu'AdSense en a besoin. Deux semaines en `Content-Security-Policy-Report-Only` d'abord. Sans `VITE_ADSENSE_CLIENT`, profil strict de l'ADR 0005 D3 (`default-src 'self'`…). Le risque d'une CSP plus large est bien moindre qu'en 0005 : il n'y a plus ni session ni écriture en ligne.
- **`_headers`** (fichiers statiques ; ne s'applique pas aux réponses du Worker, qui pose les siens) : `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` ; cache : `/assets/*` immutable un an, `/data/*`, `/models/*`, `/ads.txt` et le HTML en `no-cache` (revalidation par ETag).
- **`ads.txt`** : émis par le build comme aujourd'hui, à la racine.
- **RGPD** : aucun cookie propre au site. Consentement par le CMP de Google (Confidentialité et messages, TCF). Mentions légales : hébergeur **Cloudflare, Inc.** (adresse et téléphone tels que publiés par Cloudflare, à recopier). Politique de confidentialité : Cloudflare (journaux techniques, adresse IP) et Google (pub) comme destinataires, transferts hors UE encadrés par le Data Privacy Framework.
- **DNS** : un domaine personnalisé sur un Worker exige que la zone soit sur Cloudflare. `tatamap.fr` reste enregistré chez OVH ; ses serveurs de noms passent chez Cloudflare (plan gratuit). DNSSEC : le couper chez OVH avant le changement, puis le réactiver avec l'enregistrement DS de Cloudflare. Mail de contact : Cloudflare Email Routing (gratuit) ou garder les MX d'OVH. `www` redirigé en 301 vers l'apex.
- **Local** : l'API garde ses protections (helmet, cookie `__Host-`, contrôle d'`Origin`, limiteur de login) ; elle écoute sur `127.0.0.1` (défaut actuel) et PostgreSQL sur `127.0.0.1`.

### D6. Ce qu'on garde et ce qu'on jette de `feat/deploy-ovh`

La branche est d'abord **taguée** `archive/vps-ovh-2026-11` (commit `20d5e71`) pour que le repli (D7) reparte de là, puis on ne fusionne que ce qui sert.

| Garder (cherry-pick dans `feat/static-site`) | Jeter (reste dans le tag) |
| --- | --- |
| Retrait de la PWA (si pas déjà dans `main`) | `Dockerfile`, `.dockerignore` |
| Pages légales (`legal.ts`, `pages/legal-notice.tsx`, `pages/privacy.tsx`), hébergeur à changer | `deploy/` entier : `compose.prod.yml`, `compose.local.yml`, `Caddyfile`, `caddy/*`, `.env.example`, `README.md` |
| Front sous CSP stricte (`4e608fb`), `bootstrap.tsx` | `deploy/scripts/` : `deploy.sh`, `tatamap-deploy`, `backup.sh`, `restore-test.sh`, `push-content.sh` |
| `admin-isolation.ts` et son test | Jobs CI `images` et `deploy`, GHCR, environnement SSH (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`) |
| Limiteur de login (comptes réels, IPv6 /64) et HSTS de l'API : sans effet en ligne, inoffensifs en local | Test « leurre dans `content/` » sur les images (remplacé par les contrôles de D4) |
| `.gitignore` des `.env` imbriqués | `ACME_EMAIL`, `PRELAUNCH`, `TRUST_PROXY=1`, sauvegardes `age`/rclone/Object Storage |
| `ads.txt`, `html.cspNonce` (valeur à changer) | |

Sauvegardes : il n'y a plus de base de prod. La source de vérité est `tatamap-content` sur GitHub (privé) ; la base locale se reconstruit par `content:import`. Règle : `content:export` + push après chaque session d'édition.

Le « pré-lancement » (basic auth de 0005) : on ne déploie simplement pas sur le domaine avant l'audit ; les essais se font sur l'URL `*.workers.dev` (à désactiver ensuite, ou laisser en `noindex`).

### D7. Repli si un backend redevient nécessaire

Déclencheurs : comptes utilisateurs, paiement, espace club, écriture en ligne, ou éditeur à utiliser ailleurs que sur l'ordinateur de Fares.

- Repartir du tag `archive/vps-ovh-2026-11` et de l'ADR 0005 (VPS OVH, Caddy, PostgreSQL, sauvegardes). L'API publique existe toujours et renvoie les **mêmes formes** que les JSON statiques : le front repasse en mode `api` par `VITE_DATA_SOURCE`, rien d'autre ne change.
- Variante légère si seul un petit besoin dynamique apparaît (formulaire de contact, webhook) : une route dans le même Worker, sans base, avant d'envisager le VPS.
- Ce qui fermerait des portes, donc à éviter : faire dépendre le front d'une particularité des fichiers statiques (lire un fichier qui n'a pas d'équivalent dans l'API), ou mettre de la logique de filtrage ailleurs que dans `@tatamap/shared`.

## Conséquences

- Plus de machine à administrer, plus de sauvegarde de prod, plus de migration en prod : `prisma migrate` ne tourne qu'en local et dans la CI.
- Une publication = export du contenu + workflow `site` (quelques minutes). Pas d'édition depuis un autre ordinateur.
- Les pages sont rendues côté client (SPA) : titre et description par page restent à faire. Si le référencement compte, `site:export` pourra écrire un `techniques/<slug>/index.html` par technique (titre, description, Open Graph) à partir de l'`index.html` du build : à décider après la mise en ligne, sans changer l'architecture.
- Dépendance à Cloudflare (DNS, CDN, Worker). Sortie : le dossier `dist/` est un site statique standard ; seul le Worker du nonce est propre à Cloudflare.
- Mentions légales et politique de confidentialité à mettre à jour (hébergeur américain).

## Modifications proposées

`CLAUDE.md`, décision Monétisation (à valider par Fares) :

```diff
-- **Monétisation** (seulement après validation en club) : 1) abonnement clubs/profs (B2B, piste principale), 2) freemium pratiquants, 3) affiliation contextuelle (instructionals, kimonos), 4) sponsoring d'une catégorie. **Pas de pop-ups.** Une seule colonne de pub…
+- **Monétisation** : pub seule (décidé le 2026-11-24 : aucun abonnement, ni clubs ni pratiquants), plus affiliation contextuelle et sponsoring d'une catégorie. **Pas de pop-ups.** Une seule colonne de pub…
```

`CLAUDE.md`, tableau Stack :

```diff
-| Auth | Un seul compte admin créé par `pnpm admin:create` (argon2id) ; JWT HS256 … (ADR 0003) |
+| Auth | En local seulement : un seul compte admin créé par `pnpm admin:create` (argon2id) ; JWT HS256 … (ADR 0003) |
-| Hébergement | VPS OVH en France : Docker Compose (Caddy + API + PostgreSQL 17), … (ADR 0005) |
+| Hébergement | Site 100 % statique sur Cloudflare Workers (static assets + Worker pour le nonce CSP), JSON générés par la CI depuis `tatamap-content` ; API, base, admin et éditeur en local seulement (ADR 0006, repli : ADR 0005) |
```

`CLAUDE.md`, liste des ADR : ajouter « 0006 site statique » et noter 0005 « remplacé par 0006 ». Section « API REST (MVP) » : ajouter en tête « En local seulement. En ligne, les lectures publiques sont des fichiers `/data/v1/*.json` de même forme (ADR 0006). » Roadmap, point 4 : « Revenus : pub (AdSense, sponsors), dépôt de marque INPI ».

## Plan de mise en œuvre

1. **Tri de la branche** (`dev`) : tag `archive/vps-ovh-2026-11`, nouvelle branche `feat/static-site` depuis `main`, cherry-pick des éléments « garder » de D6.
2. **Couche de données** (`dev`) : `lib/public-data.ts`, `VITE_DATA_SOURCE`, hooks publics branchés dessus, 404 → `not_found` dans `send()`, tests.
3. **Build sans admin + export statique** (`dev`) : constante qui retire `/admin*` du build `static` ; `scripts/site-export.ts` (`pnpm site:export`) réutilisant repository et mappers, tests (schémas, publiées seulement, slugs = fichiers).
4. **Worker et en-têtes** (`dev`) : `apps/web/edge/worker.ts`, `wrangler.jsonc`, `public/_headers`, nonce `__CSP_NONCE__`, `pnpm site:preview` ; vérifier qu'une `/data/*` absente répond 404 et non `index.html`.
5. **Workflow `site`** (`dev`) : clé de lecture du repo de contenu, base jetable, import, build, export, contrôles, `wrangler deploy` ; suppression des jobs `images` / `deploy`.
6. **Comptes et DNS** (Fares) : compte Cloudflare (double authentification), zone `tatamap.fr` (serveurs de noms depuis OVH, DNSSEC), jeton API restreint, clé de déploiement sur `tatamap-content`, environnement GitHub `production`.
7. **Légal et pub** (`dev` + Fares) : mentions légales et confidentialité (Cloudflare, Google), CSP en Report-Only deux semaines, puis demande AdSense une fois le site ouvert.
8. **Audit** (`cybersecu`) : en-têtes réels (`curl -I` sur HTML, `/data`, `/assets`), absence de l'admin et de `/api` dans le build, jetons et clés à privilège minimal, workflow (pas d'artefact, pas de contenu dans les journaux).
9. **Docs** : statut de 0005, modifications de `CLAUDE.md` ci-dessus, `docs/plan-phase-3.md` (lot 8).
