# Plan phase 3 — Test en club

Objectif de la phase (CLAUDE.md) : **« un prof prêt à payer »**. Pour y arriver : un site public présentable (accueil, bibliothèque, page technique, carte des positions), en ligne sur une vraie adresse, et montré à 2 ou 3 clubs testeurs.

Références :
- Maquette validée (ordinateur et téléphone) : https://claude.ai/artifact/MKkfmuymMEHigTRvWuraid. Elle fait foi pour la mise en page, les couleurs et les textes.
- Écran d'accueil Canva d'origine du style : https://canva.link/pxs0bilfc624vby
- ADR 0003 : même origine front/API (B6), service worker qui exclut `/api/admin/*` et `/api/auth/*`, vignettes via un `<Canvas>` partagé et des `<View>` drei (D4), CSP chez l'hébergeur.
- ADR 0004 : le rendu 3D reste Three.js / R3F ; les corps humanoïdes ne font pas partie de cette phase.

Hors périmètre : comptes pratiquants et progression, espace club, Stripe, nouvelles techniques, corps humanoïdes (ADR 0004), thème clair.

## Ordre des lots

Chaque lot se termine par une PR relue par Fares, des captures téléphone et ordinateur, et la CI verte. Les lots 1 à 6 sont l'« interface solide » ; le site n'est montré à personne avant la fin du lot 8.

### Lot 0 — Prérequis côté Fares (en parallèle, sans code)

- Réserver `tatamap.fr` (et `.com` si possible) ; une adresse de contact sur le domaine ou une redirection.
- Réserver `@tatamap` sur Instagram et TikTok.
- Choisir l'hébergeur (voir lot 8) et créer les comptes.

### Lot 1 — Identité visuelle et squelette de l'appli

- Jetons de design dans `apps/web/src/index.css` via `@theme` de Tailwind 4 : fond `#0F1A1F`, surfaces `#16242A` / `#121F24`, bordures `#24363D`, texte `#E8EFEE` / `#A9BBB8`, accent `#1D9E75` (texte sur accent `#06130F`, contraste AA), adversaire `#D85A30`. Thème sombre uniquement.
- Polices DM Sans et JetBrains Mono **auto-hébergées** (`@fontsource-variable/*`), pas de Google Fonts côté site : appel à un tiers et transfert d'IP, à éviter pour le RGPD.
- Mise en page commune : barre latérale sur ordinateur, barre d'onglets en bas sur téléphone, routes publiques sous un même layout (`/`, `/bibliotheque`, `/techniques/:slug`, `/carte`). L'admin garde sa mise en page actuelle.
- Composants de base dans `apps/web/src/ui/` : bouton, pastille de filtre, badge (catégorie, niveau, gi), carte, sur-titre, étiquette monospace. Pas de bibliothèque de composants externe.
- Pages 404 et erreur réseau dans le même style.
- Critère : les quatre routes s'affichent dans le nouveau squelette (contenu provisoire), navigation clavier et cibles tactiles ≥ 44 px.

### Lot 2 — API publique en lecture

Routes prévues dans CLAUDE.md, techniques **publiées** seulement, schémas Zod dans `@tatamap/shared` :
- `GET /api/techniques?categorie=&position=&niveau=&gi=&q=` : liste résumée (slug, nom, catégorie, niveau, gi, positions de départ et d'arrivée, nombre d'étapes, pose de l'étape 1 pour la vignette). `q` : recherche insensible à la casse et aux accents sur le nom (et les tags).
- `GET /api/positions` : positions avec leur nombre de techniques publiées.
- `GET /api/graph` : nœuds = positions, arêtes = techniques publiées (soumissions rattachées à leur position de départ).
- `GET /api/tags`.
- `Cache-Control: public, max-age=60, stale-while-revalidate=600` sur ces routes (jamais sur `/api/admin/*`).
- Tests d'intégration sur `tatamap_test` : filtres, brouillons invisibles, recherche avec accents.
- Critère : la bibliothèque et la carte peuvent se construire sans autre route.

### Lot 3 — Bibliothèque (`/bibliotheque`)

- En-tête, recherche, filtres en pastilles (catégories présentes seulement, les 3 gardes, niveau, gi / no-gi), technique à la une, grille de cartes. Filtres et recherche dans l'URL (`useSearchParams`), pour partager un lien filtré.
- Vignettes 3D selon ADR 0003 D4 : un `<Canvas>` partagé, une `<View>` par carte, une seule carte animée à la fois (survol sur ordinateur, carte la plus centrée sur téléphone), étape 1 figée sinon. Repli prévu si `View` déçoit : image statique.
- Sur téléphone : filtres défilant à l'horizontale, cartes en liste.
- Critère : 15 cartes, filtres combinables, défilement fluide sur un téléphone d'entrée de gamme.

### Lot 4 — Page technique refaite (`/techniques/:slug`)

- Viewer en grand avec : lecture/pause, étape précédente/suivante, frise des étapes cliquable, vitesse 0,5× / 1× / 1,5×, recentrer, plein écran (utile pour projeter au club).
- **La caméra suit l'angle conseillé de chaque étape** pendant la lecture (aujourd'hui seule celle de l'étape 1 sert), sauf si l'utilisateur a tourné la vue ; « Recentrer » y revient.
- Liste des étapes synchronisée, points clés, erreurs fréquentes, enchaînements (cartes cliquables), lien vers les positions sur la carte.
- Balises `<title>` et description par technique (SEO), URL partageable qui ouvre une étape (`?etape=3`).
- Critère : les 15 techniques s'affichent sans défaut sur téléphone et ordinateur.

### Lot 5 — Accueil (`/`)

- Accroche, démonstration 3D (une technique en boucle, orientable), boutons vers la bibliothèque et la carte, trois atouts, chiffres réels (lus depuis l'API), section « Pour les clubs » avec contact.
- Pied de page : mentions légales, confidentialité, « Créé par Fares Haouari ».
- Critère : chargement initial léger (la 3D se charge après le texte).

### Lot 6 — Carte des positions (`/carte`)

- Graphe sans bibliothèque externe : disposition fixe en deux colonnes (dessous / dessus, d'après le rôle de la position), arêtes en SVG, nœuds en boutons HTML (accessibles au clavier). Soumissions affichées en nombre sur leur position.
- Sélection d'une position : panneau (ordinateur) ou bloc sous le graphe (téléphone) avec ses techniques ; arêtes concernées mises en avant.
- Repli lisible si le graphe grandit au-delà de ~10 positions : à réévaluer plus tard (lib de layout), pas maintenant.
- Critère : depuis la carte, on atteint chaque technique en deux clics.

### Lot 7 — Hors ligne (PWA) — retiré le 2026-11-23

Fait (PR #14) puis retiré : une app mobile équivalente prendra le hors ligne en charge. Il reste un bandeau quand le navigateur est hors ligne. Plan d'origine :


- `vite-plugin-pwa` : manifeste (nom, icônes, couleur `#0F1A1F`), précache de l'appli, cache « réseau d'abord » des routes publiques de l'API, exclusion stricte de `/api/admin/*` et `/api/auth/*` (ADR 0003).
- Bouton « Disponible hors ligne » qui télécharge toutes les techniques publiées (15 fiches, quelques centaines de Ko).
- Bandeau discret quand on est hors ligne.
- Critère : en mode avion, après une première visite, toute la bibliothèque et les 15 techniques fonctionnent.

### Lot 8 — Mise en ligne (site statique, ADR 0006)

Remplace le plan VPS OVH (ADR 0005, gardé comme repli, tag `archive/vps-ovh-2026-11`). Décision du 2026-11-24 : aucun abonnement, seule la pub rapporte ; le site public est 100 % statique sur Cloudflare Workers, sans API, base ni admin en ligne. L'API, la base, l'admin et l'éditeur restent en local.

Fait (branche `feat/static-site`) : couche de données `lib/public-data.ts` (`VITE_DATA_SOURCE`), build sans admin et `site:export` / `site:check`, Worker (nonce CSP) + `_headers` + `site:preview`, workflow `site` (déploiement Cloudflare), pages légales (Cloudflare, transferts hors UE, pas de compte), docs.

Reste à faire :
- **Comptes et DNS (Fares)** : compte Cloudflare (double authentification), zone `tatamap.fr` (serveurs de noms depuis OVH, DNSSEC), jeton API restreint, clé de déploiement sur `tatamap-content`, environnement GitHub `production`, variables `VITE_LEGAL_*`.
- **CSP en Report-Only pendant deux semaines**, puis CSP en application, puis demande AdSense une fois le site ouvert (consentement par le CMP de Google).
- **Audit `cybersecu`** avant d'ouvrir l'adresse : en-têtes réels (HTML, `/data`, `/assets`), absence de l'admin et de `/api` dans le build, jetons à privilège minimal, workflow sans artefact ni contenu dans les journaux.
- Critère : `https://tatamap.fr` sert le site statique, l'audit ne relève rien de bloquant.

### Lot 9 — Clubs testeurs (côté Fares, avec support)

- 2 ou 3 clubs. Support à préparer : une page ou un PDF de présentation d'une page, et un formulaire de retour court (ce qui sert, ce qui manque, combien ils paieraient).
- Mesure d'usage sans traceur : sans serveur en ligne, à reconsidérer (statistiques agrégées de l'hébergeur, sans cookie) ; pas de mesure tant que ce n'est pas tranché.
- Critère de la phase : **un prof prêt à payer**.

## Décisions ouvertes

1. Hébergement : décidé, ADR 0006 (site statique sur Cloudflare ; ADR 0005 en repli).
2. Adresse de contact affichée : aujourd'hui l'adresse personnelle de Fares dans la maquette ; à remplacer par une adresse sur `tatamap.fr` dès que le domaine est pris.
3. Correction des membres qui frôlent l'adversaire dans certaines transitions (contenu) : à traiter avant les clubs ou après, selon les retours.
