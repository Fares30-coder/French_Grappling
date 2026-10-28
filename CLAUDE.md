# Tatamap — contexte projet

Site web de techniques de jiu-jitsu brésilien / grappling **en français**, avec des **animations 3D orientables** de chaque technique (soumissions, passages de garde, renversements, sorties). Projet perso de Fares Haouari (dev full stack, Lille), avec un objectif de petits revenus à terme.

Documents de référence :
- Architecture et modèle de données (doc Claude) : https://claude.ai/artifact/NV7cTNjGW8yQqgCp1X3X4b
- Maquette Canva (bibliothèque, page technique, carte des positions) : https://canva.link/8itggvooxvh1kgl

## Décisions prises

- **Nom : Tatamap** (tatami + map). Concurrent au nom proche à surveiller : Tatamy (tatamy.app, journal d'entraînement arts martiaux). À faire : réserver tatamap.fr / .com, @tatamap sur Instagram et TikTok, dépôt INPI plus tard.
- **Site web d'abord (PWA)**, pas d'app mobile native au départ : la 3D web (Three.js) est mature, ça colle au stack React/Node, pas de stores, l'éditeur de poses est plus confortable sur ordinateur.
- **Différenciation** face au marché (Grapplearts, BJJ Fanatics, GrappleKit, BJJ OS, Your BJJ, Tatami…, presque tous en anglais) : le français, la 3D orientable, la carte des positions (graphe).
- **Animations** : pas de vidéo générée par IA (rendu faux sur le grappling). Chaque technique = une suite de poses (articulations des 2 combattants), interpolées. Le contenu est créé via un **éditeur de poses admin**.
- **Rendu 3D** (ADR 0004) : on garde Three.js / R3F. Évolution par étapes : corps humanoïdes glTF pilotés par les articulations (FighterMesh seulement), puis squelette `v2-21` via `upgradePose`. Changer de moteur ne réécrirait que le viewer et les enfants 3D de l'éditeur.
- **Monétisation** (seulement après validation en club) : 1) abonnement clubs/profs (B2B, piste principale), 2) freemium pratiquants, 3) affiliation contextuelle (instructionals, kimonos), 4) sponsoring d'une catégorie. **Pas de pubs classiques / pop-ups** (peu rentable sur une niche, nuit à la 3D, au RGPD et au SEO). Éventuellement une seule bannière latérale desktop, à tester plus tard.
- Encaissement via la micro-entreprise de Fares (Stripe).

## Stack

| Brique | Choix |
| --- | --- |
| Front | React + Vite + TypeScript, Tailwind CSS |
| 3D | React Three Fiber + drei (OrbitControls) |
| Données front | React Router + TanStack Query |
| PWA | vite-plugin-pwa (hors ligne au club) |
| Back | Node 24 + Fastify 5 + TypeScript (build tsdown, dev tsx) |
| ORM / base | Prisma + PostgreSQL (poses en JSONB) |
| Validation | Zod, schémas partagés front/back |
| Auth | Un seul compte admin créé par `pnpm admin:create` (argon2id) ; JWT HS256 de 2 h (renouvelé à l'usage) en cookie `HttpOnly; Secure; SameSite=Strict` ; contrôle d'`Origin` sur les requêtes d'écriture (ADR 0003) |
| Hébergement | Front Vercel ou Netlify, API + base Render ou Railway |
| CI | GitHub Actions |
| Outillage | pnpm 12 (workspaces + catalogue), Node 24 LTS, TypeScript 6 strict, Biome (lint + format), Vitest |
| Base locale | PostgreSQL 17 via docker-compose |

Structure prévue (monorepo) : `apps/web`, `apps/api`, `packages/shared`, `docker-compose.yml` (PostgreSQL local).

Décisions détaillées : `docs/adr/` (0001 outillage, 0002 modèle de données et format de pose, 0003 admin, API d'écriture et éditeur, 0004 évolution du rendu 3D). Plans : `docs/plan-phase-1.md`, `docs/plan-phase-2.md`.

## Modèle de données

Une technique est une **arête entre deux positions** (départ → arrivée, arrivée vide pour une soumission) : ça donne la carte des positions sans table supplémentaire.

- **Position** : id, slug, nom, description, rôle (dessus / dessous / neutre)
- **Technique** : id, slug, nom, catégorie, niveau, gi/no-gi, statut (brouillon/publié), version (concurrence optimiste), points clés, erreurs fréquentes ; positionDépart, positionArrivée (nullable) ; étapes ; tags
- **Étape** : id, ordre, titre, texte, durée de transition (ms), pose (JSONB, document `Pose`), version du squelette (miroir de `pose.skeleton`)
- **Pose** : document JSON validé par Zod (`@tatamap/shared`), stocké dans l'étape (pas de table dédiée, cf. ADR 0002)
- **Enchaînement** : technique source, technique cible, type (suite, contre, alternative)
- **Tag** (many-to-many avec Technique), **Admin** (email, hash mot de passe)
- Enums : catégorie = soumission, passage, renversement, sortie, projection ; niveau = débutant, intermédiaire, avancé ; gi/no-gi = gi, nogi, both
- Valeurs d'enum en anglais dans le code, la base et l'API (submission, pass, sweep, escape, takedown ; beginner, intermediate, advanced ; gi, nogi, both ; top, bottom, neutral ; followup, counter, alternative), libellés français dans `@tatamap/shared`. Le rôle d'une position est exprimé du point de vue de `me`.

### Format d'une pose (squelette `v1-11`)

11 articulations par combattant, en (x, y, z), en cm, tatami à y = 0. Ordre : head, neck, hip, elbowL, handL, elbowR, handR, kneeL, footL, kneeR, footR. Combattants : `me` (le pratiquant qui exécute la technique, couleur #1D9E75 ; dessous au départ pour le ciseau) et `opponent` (#D85A30). `camera` optionnelle (angle conseillé par étape). Repère main droite, y vers le haut, 1 unité Three.js = 1 cm ; L/R = gauche/droite propres au combattant.

```json
{
  "skeleton": "v1-11",
  "fighters": {
    "me": { "head": [x,y,z], "neck": [...], "hip": [...], "elbowL": [...], "handL": [...], "elbowR": [...], "handR": [...], "kneeL": [...], "footL": [...], "kneeR": [...], "footR": [...] },
    "opponent": { "...": "mêmes 11 articulations" }
  },
  "camera": { "position": [170, 170, 300], "target": [0, 40, 20] }
}
```

Rendu du prototype : sphères aux articulations, cylindres entre (cou-hanche, cou-coude-main ×2, hanche-genou-pied ×2), tête r=13, interpolation smoothstep entre étapes (maintien ~1,2 s, transition ~1,3 s).

### Données du prototype : ciseau depuis la garde fermée

Prototype 3D validé (poses placées à l'œil, à affiner dans l'éditeur). Coordonnées 2D issues d'un SVG (y vers le bas, sol à y=306) converties en 3D par `x3 = x - 300`, `y3 = 306 - y`, `z = 0` pour tête/cou/hanche, `+16` pour les membres *L, `-16` pour les membres *R. Étape 4 : `me` décalé de +18 en z ; `opponent` = pose 3 tournée de 55° autour de l'axe X (chute latérale), y min 6.

Étapes :
1. Garde fermée : contrôle du col et de la manche
2. Ouvre la garde, décale les hanches, tibia en travers du ventre
3. Tire l'adversaire vers toi pour le casser vers l'avant
4. Ciseau : la jambe du haut pousse, celle du bas fauche
5. Il bascule sur le côté : tu finis en montée (mount)

Poses 2D (ordre des articulations ci-dessus), étapes 1 à 4 :

```js
const ME_2D = [
  [[150,282],[175,285],[270,288],[215,250],[290,215],[220,258],[285,230],[320,250],[352,262],[315,256],[345,272]],
  [[155,280],[180,284],[275,286],[230,235],[312,182],[235,250],[300,220],[300,212],[348,226],[290,288],[322,296]],
  [[165,275],[190,280],[275,286],[235,225],[290,190],[235,245],[285,222],[295,210],[340,222],[295,288],[325,296]],
  [[230,240],[250,255],[300,285],[290,225],[340,205],[290,240],[335,225],[330,200],[385,185],[345,285],[390,292]]
];
const OPP_2D = [
  [[322,150],[325,175],[332,240],[302,210],[278,258],[308,215],[285,262],[290,295],[372,298],[295,292],[376,296]],
  [[318,152],[322,178],[332,240],[300,212],[282,262],[305,218],[288,266],[292,295],[372,298],[298,292],[376,296]],
  [[272,172],[292,190],[335,242],[275,232],[262,270],[280,238],[268,274],[295,295],[372,298],[300,292],[376,296]]
];
```

Étape 5 (directement en 3D) :

```js
const ME_5 =  [[30,130,62],[30,105,55],[30,40,35],[55,75,75],[45,30,95],[5,75,75],[15,30,95],[65,8,35],[65,6,-5],[-5,8,35],[-5,6,-5]];
const OPP_5 = [[30,12,140],[30,14,115],[30,14,20],[55,20,75],[40,40,45],[5,20,75],[20,40,45],[50,45,-20],[50,6,-55],[10,45,-20],[10,6,-55]];
```

## API REST (MVP)

Public (techniques publiées uniquement) :
- `GET /api/techniques?categorie=&position=&niveau=&gi=&q=`
- `GET /api/techniques/:slug` (étapes, poses, enchaînements)
- `GET /api/positions`, `GET /api/graph` (nœuds = positions, arêtes = techniques), `GET /api/tags`

Auth : `POST /api/auth/login`, `POST /api/auth/logout`

Admin (cookie de session, toutes sous `/api/admin`, un seul hook d'auth, réponses `no-store`) :
- `GET /api/admin/me`
- `GET|POST /api/admin/techniques`, `GET|PUT|DELETE /api/admin/techniques/:id` (PUT = remplacement complet infos + étapes + poses + tags + enchaînements, avec `version`)
- `POST /api/admin/techniques/:id/publish`, `/unpublish`, `/duplicate`
- `GET|POST /api/admin/positions`, `PUT /api/admin/positions/:id`
- `GET|POST /api/admin/tags`

## Écrans

- `/` Bibliothèque : recherche, filtres (catégorie, position, gi/no-gi, niveau), grille de cartes avec vignette 3D
- `/techniques/:slug` Page technique : viewer 3D (lecture/pause, étapes, vitesse, caméra libre), étapes synchronisées, points clés, erreurs fréquentes, enchaînements
- `/carte` Carte des positions (graphe cliquable)
- `/admin/login`, `/admin/techniques` (liste, création, duplication), `/admin/techniques/:id` Éditeur de poses (articulations déplaçables, vues face/profil/dessus, aperçu, publier)

Le viewer 3D est **un seul composant réutilisé** (page technique, vignettes au survol, éditeur).

## Roadmap (critères de passage plutôt que dates)

1. **Socle** : repo, CI, Prisma, API en lecture, viewer 3D sur un JSON → critère : *le ciseau s'anime en lisant l'API*
2. **Contenu** : éditeur de poses, connexion admin, 15 à 20 techniques → critère : *15 techniques publiées*
3. **Test en club** : PWA hors ligne, carte des positions, 2 ou 3 clubs testeurs → critère : *un prof prêt à payer*
4. **Revenus** : espace club, abonnements Stripe, dépôt de marque INPI

## Prochaines étapes immédiates (phase 1)

1. Monorepo `apps/web`, `apps/api`, `packages/shared`
2. `docker-compose.yml` avec PostgreSQL
3. Schéma Prisma + seed du ciseau (données ci-dessus)
4. `GET /api/techniques/:slug`
5. Composant viewer React Three Fiber qui lit la technique depuis l'API

## Conventions

- Code et commentaires en anglais, contenu du site en français.
- TypeScript strict partout.
- Frontière 3D : `three` / `@react-three/*` uniquement dans `features/viewer`, les enfants 3D de l'éditeur et `features/dev` (règle Biome `noRestrictedImports`). Une pose ne contient que des points en cm, rien de propre au moteur.
- Le repo de code est **public** (portfolio). Le contenu (positions, tags, techniques) est exporté dans `content/` par `pnpm content:export` et réimporté par `pnpm content:import` (sauvegarde et passage en prod). `content/` est un clone du repo **privé** `Fares30-coder/tatamap-content`, ignoré par ce repo : ne jamais commiter de contenu ici.
