# ADR 0004 — Évolution du rendu 3D

- Statut : accepté (critères de lancement de l'étape 1 validés ; source du modèle et détail du squelette v2 à trancher plus tard)
- Date : 2026-10-28
- Auteur : agent architecte (pour Fares Haouari)
- Dépend de : ADR 0002 (format de pose `v1-11`, D6 versionnement, `upgradePose`), ADR 0003 (partie D, contrat du viewer)

## Contexte

Le rendu actuel (sphères et cylindres) suffit pour valider le contenu, mais il sera vite jugé « bâtons » par des pratiquants. Question de Fares : pourra-t-on améliorer le rendu, voire changer de kit 3D, sans déranger le reste du site ?

État réel du code (vérifié sur `tools/pose-kit`, 2026-10-28) :

- Seuls 6 fichiers importent `three` ou `@react-three/*` : `apps/web/src/features/viewer/{FighterMesh,TechniqueScene,TechniqueViewer}.tsx`, `apps/web/src/features/admin/editor/{JointGizmo,CameraCapture}.tsx` et `apps/web/src/features/dev/PosePreviewPage.tsx`. `Tatami.tsx` n'utilise que du JSX R3F (sans import).
- Les pages n'utilisent que `TechniqueViewer` (`features/techniques/TechniqueView.tsx`, `TechniqueEditorPage.tsx`, `PosePreviewPage.tsx`) et le type `ViewPreset` de `viewer/camera.ts`.
- La logique d'animation est pure et testée en Node : `interpolate.ts` (dans `shared`), `timeline.ts`, `camera.ts`, `reapply.ts`.
- `tools/pose-kit` n'importe pas `three` : `pose:render` pilote le vrai viewer via Playwright sur `/dev/pose-preview`.
- Une poignée de couplage : `TechniqueSceneProps.onJointPointerDown` expose `ThreeEvent<PointerEvent>` (type R3F) aux pages, alors que l'éditeur n'utilise que `joint`.
- Le contenu (15 techniques dans `content/techniques/`) est en `v1-11` ; `content:export` passe déjà par `poseSchema` + `upgradePose`, mais `content:import` valide avec `currentPoseSchema` (via `stepInputSchema`).

## Décision

Garder **Three.js + React Three Fiber**. Faire évoluer le rendu en deux étapes indépendantes, déclenchées par des critères, en ne changeant de moteur que si un besoin précis l'exige. Dès maintenant, préserver les frontières ci-dessous.

### 1. Frontières à préserver dès maintenant

**F1. Imports 3D confinés.** `three`, `three/*`, `@react-three/*` ne sont importés que dans :
- `apps/web/src/features/viewer/**` ;
- `apps/web/src/features/admin/editor/JointGizmo.tsx` et `CameraCapture.tsx` (enfants 3D de l'éditeur, passés en `children`) ;
- `apps/web/src/features/dev/**`.

Jamais dans `packages/shared`, `apps/api`, `tools/pose-kit`, ni dans une page ou un composant d'UI. Un nouvel enfant 3D de l'éditeur s'ajoute explicitement à la liste (ou on regroupe les deux fichiers dans `admin/editor/scene/` et on exempte ce dossier).

**F2. Format de pose neutre.** Une pose ne contient que des **points en cm** dans le repère d'ADR 0002 (et l'indice de caméra position/cible). Jamais de quaternions, d'angles d'Euler propres à un moteur, de noms d'os d'un modèle, d'ids de mesh ou de chemins d'asset. Une orientation dont on aurait besoin s'exprime par un **point supplémentaire** (cf. étape 2), qui s'interpole comme les autres et s'édite avec le même gizmo.

**F3. Contrat du viewer = seule interface.** Les pages ne connaissent que `TechniqueViewer` / `TechniqueSceneProps` et les types de `@tatamap/shared`. Les types du contrat ne référencent aucun type `three` / R3F. Action immédiate (petite, pour `dev`) : remplacer

```ts
onJointPointerDown?: (joint: JointRef, event: ThreeEvent<PointerEvent>) => void;
```

par

```ts
onJointPointerDown?: (joint: JointRef) => void;
```

(`TechniqueEditorPage` n'utilise déjà que `joint`). `children` reste l'unique porte d'entrée pour du contenu 3D propre à l'éditeur ; elle est réservée aux fichiers de F1.

**F4. Logique pure hors des composants 3D.** Interpolation, timeline, cadrage caméra, décisions de réapplication, et demain le calcul du rig (étape 1) vivent dans des modules `.ts` sans JSX ni contexte R3F, testés en Node. Les maths de `three` (`Vector3`, `Quaternion`) sont tolérées dans ces modules **uniquement** s'ils sont dans `features/viewer/` ; ce qui doit servir aussi à l'API ou à pose-kit va dans `packages/shared` en maths maison.

**Garde-fou automatisé** : règle Biome `noRestrictedImports` (déjà notre linter, exécuté par `pnpm lint` = `biome ci .` en CI, coût nul). À ajouter dans `biome.json` (testé avec Biome 2.6.3 dans un dossier temporaire : les 3 formes d'import sont signalées hors des dossiers exemptés, rien dedans) :

```jsonc
{
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "three": "3D boundary (ADR 0004): import three only in features/viewer, editor 3D children or features/dev.",
              "@react-three/fiber": "3D boundary (ADR 0004): use TechniqueViewer and its props instead.",
              "@react-three/drei": "3D boundary (ADR 0004): use TechniqueViewer and its props instead."
            },
            "patterns": [
              { "group": ["three/**", "@react-three/**"], "message": "3D boundary (ADR 0004)." }
            ]
          }
        }
      }
    },
    "domains": { "react": "recommended" }
  },
  "overrides": [
    {
      "includes": [
        "apps/web/src/features/viewer/**",
        "apps/web/src/features/dev/**",
        "apps/web/src/features/admin/editor/JointGizmo.tsx",
        "apps/web/src/features/admin/editor/CameraCapture.tsx"
      ],
      "linter": { "rules": { "style": { "noRestrictedImports": "off" } } }
    }
  ]
}
```

Les clés `vcs`, `files`, `formatter`, `javascript`, `assist` existantes restent inchangées. F2 est déjà garanti par les `z.strictObject` de `poseV1_11Schema` (toute clé inconnue est rejetée) ; F3 et F4 relèvent de la revue.

### 2. Étape 1 : corps humanoïdes (sans changer le format)

**Approche.** Un modèle **glTF skinné** (`.glb`) unique, cloné pour `me` et `opponent` (et le fantôme), teinté par `FIGHTER_COLORS`. Les poses restent en `v1-11` ; à chaque image, après `interpolatePose`, un solveur pur calcule la rotation de chaque os à partir des points.

- **Modèle** : CC0 (par exemple personnages de base Quaternius ou export MakeHuman en CC0) ou fait sur mesure dans Blender. Éviter Mixamo et les assets sous licence « usage dans un produit, pas de redistribution » : le `.glb` est téléchargeable par n'importe quel visiteur. Version kimono plus tard (variante du même rig, ceinture et col modélisés, pas de simulation de tissu).
- **Rig** : humanoïde standard, 14 os utiles : `pelvis, spine, chest, neck, head, upperArm/lowerArm/hand ×2, upperLeg/lowerLeg/foot ×2`. Pose de repos en T, os orientés le long du segment (convention glTF / Blender, axe Y de l'os vers l'enfant).
- **Pilotage** (`features/viewer/rig.ts`, pur, testé) :
  - **Direction** de chaque segment : `Quaternion.setFromUnitVectors(restDir, targetDir)` en espace parent (cou→hanche pour la colonne, coude→main pour l'avant-bras, etc.).
  - **Torsion** : un membre est un plan (épaule–coude–main, hanche–genou–pied) ; on aligne l'axe de flexion du coude / genou sur la normale de ce plan, ce qui fixe la torsion du bras et de la cuisse. Membre presque tendu (angle < 10°) : on garde la torsion de l'image précédente.
  - **Orientation du buste** (absente de `v1-11`, qui n'a que cou et hanche) : axe latéral estimé par `(elbowL − elbowR) + (kneeL − kneeR)` projeté perpendiculairement à la colonne ; repli sur l'image précédente si le vecteur est dégénéré (membres croisés).
  - **Épaules et hanches** : absentes ; placées à cou ± 18 cm et hanche ± 10 cm sur l'axe latéral estimé. Le bras du modèle part donc de l'épaule et non du cou : l'erreur est de quelques cm à la main.
  - **Mains, pieds, tête** : pas d'orientation en `v1-11`. Main dans le prolongement de l'avant-bras, paume dans le plan du coude ; pied perpendiculaire au tibia, orienté vers l'avant du buste ; tête dans l'axe cou→tête, visage vers l'avant du buste.
  - **Longueurs** : les os du modèle **ne sont pas étirés** au-delà de ±10 % ; une échelle globale par combattant est calculée sur l'étape 1 (taille). Les extrémités peuvent donc tomber à quelques cm des points saisis ; `pose:check` signale déjà les longueurs incohérentes.
- **Éditeur** : les sphères restent visibles et cliquables quand `onJointPointerDown` est fourni (corps translucide dessous) ; le fantôme reste en bâtons. Pas de nouvelle prop obligatoire. Prop optionnelle future : `outfit?: 'gi' | 'nogi'` (dérivée de `technique.gi`).

**Impact.**
- Code : `FighterMesh.tsx` (ou un `BodyMesh.tsx` à côté, choisi dans `FighterMesh`), `rig.ts` + tests, un asset `apps/web/public/models/fighter.glb`. Aucun changement de `shared`, de l'API, du contenu, de pose-kit (les captures `pose:render` montrent automatiquement le nouveau rendu), ni des pages.
- Chargement : `useGLTF` de drei derrière un `Suspense` dont le repli est le rendu bâtons actuel (pas d'écran vide, pas de régression si l'asset échoue).
- Taille : budget **≤ 1,5 Mo** pour le `.glb`, 5 à 10 k triangles par combattant, pas de texture (couleur par matériau) ou une seule en KTX2. Compression **meshopt** (`gltfpack`), décodeur embarqué dans three. **Pas de Draco** : drei charge son décodeur depuis un CDN Google par défaut, ce qui casse le hors-ligne et la future CSP.
- Perf mobile : un seul modèle chargé, cloné (`SkeletonUtils.clone`), 2 ou 3 maillages skinnés : négligeable. Avec les vignettes (`View`, ADR 0003 D4), seule la carte active anime.
- PWA (phase 3) : le `.glb` fait partie du précache de `vite-plugin-pwa` (`globPatterns` incluant `**/*.glb`), nom de fichier versionné (`fighter.v1.glb`) pour invalider proprement.

**Critères pour la lancer** (tous) :
1. critère de phase 2 atteint (15 techniques publiées) : le contenu passe avant le rendu ;
2. retour concret des testeurs (phase 3) ou d'un prof : lecture difficile (qui est qui, sens du buste, côté), ou rendu jugé repoussoir ;
3. un spike d'une journée sur le ciseau, comparé via `pose:render`, montre un gain net de lisibilité.

### 3. Étape 2 : squelette `v2-21`

**Articulations** (toujours des points en cm, F2) : `head, nose, neck, chest, pelvis, shoulderL, shoulderR, elbowL, elbowR, handL, handR, handTipL, handTipR, hipL, hipR, kneeL, kneeR, footL, footR, toeL, toeR`.

- `pelvis` remplace `hip` (centre du bassin) ; `hipL`/`hipR` = articulations de hanche.
- `handL` = poignet, `handTipL` = bout des doigts (orientation de la main) ; `footL` = cheville, `toeL` = bout du pied.
- `nose` donne l'orientation de la tête, `chest` la flexion et la torsion du buste avec les épaules.
- **Prises** (col, manche, crochets) : pas des articulations. Un champ optionnel `contacts?: Array<{ from: JointRef; to: { fighter; joint } ; kind: 'grip' | 'hook' | 'frame' }>` sans rien de moteur. Comme ajout optionnel, il peut même arriver en `v1-11` (ADR 0002 D6 règle 2), indépendamment de `v2`.

**`upgradePose` v1-11 → v2-21** (pur, dans `packages/shared/src/pose/upgrade-v1-v2.ts`) :
- conservés tels quels : `head, neck, elbowL/R, handL/R, kneeL/R, footL/R` ; `pelvis = hip` ; `camera` copiée ;
- repère du buste : `up = norm(neck − hip)`, `left = norm(projection ⊥ up de (elbowL − elbowR) + (kneeL − kneeR))`, repli sur l'axe x du monde projeté si dégénéré ; `forward = up × left` (main droite, testé sur le ciseau : `me` doit regarder l'adversaire) ;
- `chest = hip + 0,65 · (neck − hip)` ;
- `shoulderL/R = neck ± 18 · left − 4 · up` ; `hipL/R = hip ± 10 · left` ;
- `handTip = hand + 9 · norm(hand − elbow)` ;
- `toe = foot + 12 · norm(forward projeté ⊥ (foot − knee))` ;
- `nose = head + 11 · forward` ;
- tous les points bornés par `clampVec3` (y ≥ 0).

Tests : toute pose `v1-11` des fixtures et de `content/` donne une pose valide pour le schéma `v2-21` ; les points conservés sont identiques ; `mirrorPose(upgrade(p))` = `upgrade(mirrorPose(p))` à 1 cm près.

**Impact.**
- `shared` : `skeleton-v2-21.ts` (joints, os, schéma), union `poseSchema` élargie, `CURRENT_SKELETON` bascule, `mirrorPose`, `boneLengths`, `poseWarnings`, `starter-pose` portés. `JointRef` suit `CurrentJoint`.
- API : rien de plus que `upgradePose` déjà appelé à la lecture ; script idempotent `apps/api/scripts/migrate-poses.ts` (ADR 0002 D6.6).
- Contenu : `content:import` doit lire avec `poseSchema` puis `upgradePose` (aujourd'hui `currentPoseSchema` : à corriger **au moment** de la bascule), puis `content:export` réécrit `content/` en `v2-21` (un commit dans le repo privé). Les points dérivés sont ensuite affinés à la main, technique par technique, sans urgence.
- Éditeur : panneau de 42 boutons (regroupés par membre), libellés FR, gizmo inchangé. Option utile : déplacer `elbow` entraîne `handTip` (rigidité de la main) ; rien d'obligatoire.
- pose-kit : `ik.ts`, `fighter.ts`, `analyze.ts`, `pose:check` à porter (le constructeur de combattant y gagne : épaules et bassin explicites).
- Viewer : `FighterMesh` bâtons lit `BONES` de la version courante ; le solveur de l'étape 1 perd la plupart de ses approximations (épaules, buste, mains, pieds, tête deviennent des données).
- PWA : changer le nom du cache API à la migration (ADR 0002 D6.8).

**Critères de déclenchement** (l'un des deux) :
1. étape 1 en ligne et les approximations se voient sur plusieurs techniques (buste qui pivote mal, mains ou pieds mal orientés, épaules « dans le cou ») ;
2. le contenu l'exige : techniques où l'épaule, le poignet ou la prise sont le sujet (kimura, clé de pied, prises de col).

Ne pas attendre trop : la conversion est automatique, mais l'affinage manuel des points dérivés coûte proportionnellement au nombre de techniques.

### 4. Changer de moteur

**Réécrit** : `features/viewer/*.tsx` (scène, `FighterMesh`, tatami, caméras, contrôles), `rig.ts` si écrit avec les maths de three, les enfants 3D de l'éditeur (`JointGizmo`, `CameraCapture`), `PosePreviewPage`. Éventuellement l'asset si le moteur ne lit pas le glTF (tous les candidats sérieux le lisent).

**Ne bouge pas** : format de pose et `shared`, API et base, `content/`, pages et éditeur hors 3D (ils ne voient que le contrat de F3), `interpolate.ts` (dans `shared`), `timeline.ts`, `camera.ts`, `reapply.ts`, pose-kit (`pose:render` capture la page, quel que soit le moteur).

**Justifié seulement si** un besoin précis est hors de portée de three/R3F après essai : par exemple rendu photoréaliste de tissu, ou une app native qui ne pourrait pas embarquer de WebView. Un « meilleur rendu » général ne le justifie pas : il vient du modèle, des matériaux et de l'éclairage, pas du moteur. Coût estimé : quelques jours, grâce aux frontières ci-dessus.

### 5. Import externe (Blender, mocap)

- Un **convertisseur hors du site** (`tools/pose-import/`, CLI Node, ou script Python dans Blender) lit un fichier BVH / FBX / glTF animé, échantillonne les positions monde des os aux images clés choisies, les mappe vers les articulations du squelette courant (table de correspondance par rig source), convertit les unités (m → cm, Z-up → Y-up) et écrit un `content/techniques/<slug>.json` ou un fragment d'étapes, validé par `currentPoseSchema`.
- La base, l'API et le site ne stockent **aucun format d'animation propriétaire** (ni `.fbx`, ni `.blend`, ni clips glTF) : seulement des poses. Les fichiers sources restent dans le repo privé de contenu si besoin.
- Les poses importées passent par `pose:check` puis l'éditeur comme les autres. Rien à construire tant qu'aucune source mocap n'existe.

## Conséquences

- Le rendu peut changer (bâtons → corps → kimono) sans toucher aux pages, à l'API, à la base ni au contenu.
- Le format de pose reste lisible par n'importe quel moteur, outil ou import, au prix de quelques approximations tant qu'on reste en `v1-11`.
- Une règle de lint de plus, sans coût d'exécution. Ajouter un fichier 3D hors liste demande de modifier `biome.json` : c'est voulu, la frontière devient une décision visible en revue.
- L'étape 1 ajoute un asset de ~1,5 Mo au premier chargement de la page technique (puis en cache, et en précache PWA).

## Proposition de modification de `CLAUDE.md`

Dans « Décisions prises », après la puce **Animations** :

```md
- **Rendu 3D** (ADR 0004) : on garde Three.js / R3F. Évolution par étapes : corps humanoïdes glTF pilotés par les articulations (FighterMesh seulement), puis squelette `v2-21` via `upgradePose`. Changer de moteur ne réécrirait que le viewer et les enfants 3D de l'éditeur.
```

Dans « Conventions » :

```md
- Frontière 3D : `three` / `@react-three/*` uniquement dans `features/viewer`, les enfants 3D de l'éditeur et `features/dev` (règle Biome `noRestrictedImports`). Une pose ne contient que des points en cm, rien de propre au moteur.
```

## Prochaines actions

1. `dev` : ajouter la règle Biome ci-dessus et retirer `ThreeEvent` de `onJointPointerDown` (F3). Petite PR, à faire maintenant.
2. `dev` : quand `CURRENT_SKELETON` changera, faire lire `content:import` avec `poseSchema` + `upgradePose` (noté ici pour ne pas l'oublier).
3. Fares : choisir la source du modèle (CC0 existant ou sur mesure) au moment de l'étape 1, après les critères remplis.
4. Spike étape 1 (une journée, ciseau, comparaison `pose:render`) une fois la phase 2 terminée.

## Addendum (2026-11-02) : interpolation par os

Entre deux étapes, `interpolatePose` ne déplace plus chaque articulation en ligne droite : la hanche va en ligne droite, puis chaque os (`BONE_CHAIN_V1_11`, de la hanche vers les extrémités) tourne sur un grand cercle et sa longueur varie linéairement. En ligne droite, un bras qui pivote raccourcissait jusqu'à 38 cm au milieu de la transition ; les membres gardent maintenant leur longueur. Le format de pose ne change pas (toujours des points en cm, F2). Les points ajoutés par `v2-21` devront avoir un parent dans la chaîne. Les scripts Blender (`tatamap_humanoid.py`, `transitions.py`) font le même calcul.

## Addendum (2026-11-03) : étape 1 lancée, avec le mannequin des vidéos

Fares a lancé l'étape 1 avant les critères (le mannequin Blender des vidéos était prêt et jugé bien plus lisible que les bâtons). Ce qui diffère du plan ci-dessus :

- **Source du modèle** (action 3) : le mannequin fait sur mesure dans Blender (`tools/blender/tatamap_humanoid.py`), exporté par `tools/blender/export_site_model.py` en `apps/web/public/models/fighter.v1.glb`. C'est notre œuvre : pas de question de licence.
- **Rig** : 55 os indépendants (sans hiérarchie) au lieu de 14, comme dans Blender : bassin, abdomen, poitrine, cou, tête, et par côté clavicule, deltoïde, bras (et son os de torsion), avant-bras, main, cuisse (et son os de torsion), tibia, pied, trois phalanges par doigt et pour le pouce. Les repères de repos de chaque os sont dans les extras de la scène glTF (`tatamapRest`).
- **Pilotage** : `features/viewer/rig.ts` est le portage de `derived_points` / `bone_frames` (épaules en omoplate, hanches, sens du buste par les cuisses, torsion vers le coude et le genou, mains selon `hands` ou automatiques). `rig.test.ts` le compare à des repères calculés par Blender (`tools/blender/rig_fixture.py`, sur les poses publiques du ciseau) : le site et les vidéos posent le modèle de la même façon. Chaque os est placé par `repère(maintenant) × repère(repos)⁻¹`, comme dans Blender ; les conventions d'axes de l'export glTF s'annulent. Les os sont étirés à la longueur saisie (pas d'échelle globale) : les extrémités tombent exactement sur les points.
- **Peau** : quaternions doubles avec étirement, comme « Preserve Volume » dans Blender (`dq-skinning.ts`, shader injecté dans le matériau). Le skinning linéaire de three écrasait le bras en « papillote » dès que ses deux moitiés se tordaient de plus de 120° l'une par rapport à l'autre.
- **Pieds** : ils pointent comme la rotule (le sens du buste seulement jambe tendue). Pris du buste, ils tournaient autour du tibia, jusqu'à un tour complet, chaque fois que le sens du buste basculait.
- **Taille** : 873 Ko non compressé (15 200 sommets), sous le budget de 1,5 Mo ; la compression meshopt (`gltfpack -cc -kn -ke`, garder noms et extras) reste à faire. Précaché par la PWA (`**/*.glb`).
- **Repli** : bâtons pendant le chargement, si le modèle échoue (`BodyErrorBoundary`), et pour le fantôme de l'éditeur. Dans l'éditeur, le corps est translucide et les sphères restent cliquables par-dessus.

## Addendum (2026-11-04) : étape 2 faite, squelette `v2-21`

Déclenchée par le critère 2 (la guillotine, la clé de bras : l'épaule et la prise sont le sujet ; sans épaule, le haut du bras visible allait de 18 à 40 cm selon sa direction). Ce qui diffère du plan de la section 3 :

- **Points dérivés = ceux du mannequin.** `upgradeV1toV2` place les nouveaux points là où `rig.ts` et `tatamap_humanoid.py` les calculaient déjà, et non avec les valeurs approchées du plan : épaules à cou ± 17 cm et 5 cm plus bas, déplacées comme une omoplate pour garder le haut du bras entre 27 et 34 cm ; hanches à bassin ± 9 cm et 5 cm plus bas ; `chest` à 34 cm sur la colonne ; `handTip` à 8 cm au-delà du milieu de la main ; `toe` à 15 cm de la cheville, dans le sens de la rotule ; `nose` à 11 cm devant la tête. Une pose convertie s'affiche donc exactement comme avant (`rig.test.ts`, contre Blender, à 0,01 cm). Seule différence : un doigt ou un orteil qui passait sous le tapis est relevé pour s'y poser (même longueur), le schéma refusant y < 0.
- **`handL/R` reste le milieu de la main** (et non le poignet) : c'est ce que contiennent les données ; le poignet est dérivé à 7 cm avant, comme dans le rig.
- **Repère du buste** : gauche = l'axe entre les deux hanches, avant = gauche × haut (le plan disait haut × gauche, ce qui donne l'arrière).
- **Chaîne d'interpolation** : bassin → poitrine → cou → tête → nez ; cou → épaule → coude → main → doigts ; bassin → hanche → genou → cheville → orteils. Les bras tournent maintenant autour de l'épaule : certaines transitions réglées en `v1-11` changent un peu et sont à revérifier (`transitions.py`, `pose:check`).
- **Éditeur** : 42 boutons regroupés par partie du corps. Déplacer une articulation entraîne ses extrémités (`moveJoint`, `JOINT_FOLLOWERS` : main → doigts, cheville → orteils, tête → nez, bassin → hanches, cou → épaules), qui restent déplaçables seules.
- **Corps standard `v2-21`** : cou-épaule hors liste (l'omoplate bouge). Les cuisses mesurées depuis la vraie hanche varient de 34 à 44 cm sur le contenu converti : en `v1-11` la cuisse partait du centre du bassin, et le mannequin l'étirait sans le dire. `pose:check` le signale désormais. `pnpm pose:legs <slug|--all> [--write]` les ramène à 41,5 cm (cuisse à plus de 5 % du standard : genou replacé par IK depuis la hanche, cheville fixe, même sens de flexion, jamais sous le tapis) ; passé sur tout le contenu (356 cuisses, genou déplacé de 5,4 cm en médiane, 13 cm au plus).
- **Migration** : `pnpm content:upgrade` (fichiers de `content/`, sans base) et `pnpm db:migrate-poses` (base, ADR 0002 D6.6), idempotents ; les fichiers de contenu acceptent toute version et sont convertis à la lecture (`contentStepSchema`). Cache PWA renommé `tatamap-api-v2-21` (D6.8).
- **Outils** : pose-kit (constructeur avec IK depuis l'épaule et la hanche, capsules lues dans la pose, `pose:separate` qui réécrit la pose entière), scripts Blender via `tools/blender/tatamap_pose.py` (même format, même conversion à 10⁻¹³ cm près sur tout le contenu). Le rig d'édition Blender pose toujours les 11 points de base ; à l'export, une étape qui n'a pas bougé garde ses 21 points, une étape modifiée a ses autres points dérivés à nouveau.
