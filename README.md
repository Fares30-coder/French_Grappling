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
