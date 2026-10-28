# Tatamap

Site de techniques de jiu-jitsu brésilien / grappling en français, avec des animations 3D orientables. Contexte complet : `CLAUDE.md` ; décisions : `docs/adr/` ; plan : `docs/plan-phase-1.md`.

## Démarrage rapide

Prérequis : Node 24 (`.nvmrc`), pnpm 12.15.0, Docker.

```sh
pnpm install
pnpm dev          # web sur http://localhost:5173, API sur http://127.0.0.1:3000
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Compte admin

```sh
pnpm admin:create <email>   # demande le mot de passe deux fois, sans l'afficher
```

Relancer la commande sur le même email change le mot de passe et déconnecte les sessions ouvertes. Ne jamais écrire le mot de passe dans la ligne de commande (historique du shell, liste des processus). Si le script n'a pas de terminal et que `ADMIN_PASSWORD` est nécessaire :

```sh
read -s ADMIN_PASSWORD; export ADMIN_PASSWORD
pnpm admin:create <email>
unset ADMIN_PASSWORD
```
