# Tournoi de palet du CJVHB

Site qui remplace l'Excel d'organisation du concours de palets du club de hand (CJVHB, Chantonnay). Analyse des Excel d'origine : `docs/analyse-excels.md`. Décisions produit : `docs/grilling.md`.

## Agent skills

### Issue tracker

Les issues et specs sont des fichiers markdown locaux dans `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Labels par défaut (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context : `GLOSSARY.md` et `docs/adr/` à la racine. See `docs/agents/domain.md`.

## Stack et commandes

Un seul process Node (Fastify) sert le client buildé (`dist/`), l'API et le WebSocket `/ws`. Le serveur est en TypeScript exécuté tel quel par Node (type stripping) : imports avec l'extension `.ts`, pas d'`enum` ni de `namespace` (`erasableSyntaxOnly`). Base SQLite via `node:sqlite`, dans `$DATA_DIR/tournoi-palet.db` (`./data` en local).

- `src/engine/` : moteur du tournoi en TypeScript pur (event sourcing : `decide` / `evolve` / vues / `describeEvent`), sans node:*, base ni horloge. Mode d'emploi pour ajouter une commande en tête de `engine.ts`, helper de test `run()` dans `testing.ts`.
- `src/client/` : Vite + React + TypeScript. Routage maison (`router.tsx`), vues en direct (`live.ts`), onglets de la console (`console/tabs.tsx`).
- `src/server/` : `app.ts` (`buildApp`, testable sans port fixe), `index.ts` (point d'entrée), `db.ts` (table `events`), `editions.ts` (rejouage au démarrage, application des commandes), `routes-*.ts`, `ws.ts`, `hub.ts`, `auth.ts`.
- `scripts/backup.mjs` : snapshot SQLite cohérent, utilisé par la sauvegarde nocturne.

Mot de passe de la console : `ADMIN_PASSWORD` ; en local, s'il est absent, c'est `admin` (en production le serveur refuse de démarrer sans lui).

Node 24 (`.nvmrc`, comme la CI et l'image Docker). Avec le npm 10 de Homebrew, `npm install` plante sur l'arbre de vitest 5 : utiliser `npx -y npm@11 install <paquet>`.

| Commande | Rôle |
|---|---|
| `npm test` | Vitest, une passe (`src/**/*.test.ts`). Les tests serveur démarrent `buildApp` sur le port 0 et le ferment dans `afterAll`. |
| `npm run test:watch` | Vitest en continu, pour le TDD. |
| `npm run typecheck` | `tsc --noEmit` sur client, serveur et config. |
| `npm run build` | build Vite du client dans `dist/`. |
| `npm run dev` + `npm run dev:server` | client Vite (port 5173, qui proxifie `/api`, `/ws`, `/health`) + serveur (port 8787). |
| `npm start` | serveur de prod local, sert `dist/` (lancer `npm run build` avant). |

La CI lance `typecheck`, `test` puis `build` : les trois doivent passer avant de pousser.

## Déployer et vérifier la prod

- Production : https://tournoi-palet.jimmydore.fr, conteneur `tournoi-palet-web` sur le VPS Hetzner (alias SSH `hetzner`, accès non interactif : `ssh -o BatchMode=yes hetzner …`).
- Repo : `JimmyDore/tournoi-palet` (public), remote `origin` en SSH. Détails (secrets, sauvegardes, restauration) : `deploy/README.md`.

**Déployer** = pousser sur `main`. Il n'y a pas d'autre méthode : ne jamais lancer `docker compose` ni modifier de fichier à la main sur le serveur.

```sh
git push origin main
gh run list -R JimmyDore/tournoi-palet -L 1          # repérer le run du commit poussé
gh run watch <id> -R JimmyDore/tournoi-palet --exit-status
gh run view <id> -R JimmyDore/tournoi-palet --log-failed   # en cas d'échec
```

Le workflow `.github/workflows/deploy.yml` a trois jobs : `test` (typecheck, tests, build), `deploy` (build de l'image sur le serveur, attente du conteneur `healthy`), `health` (sonde de l'URL publique). `deploy` vert et `health` rouge : chercher côté DNS ou Caddy (route dans `~/Projets/RaveTycoon/deploy/Caddyfile`).

**Vérifier** après un déploiement vert :

```sh
curl -fsS https://tournoi-palet.jimmydore.fr/health
# attendu : {"status":"ok","database":"ok","websocket":"ok"}
curl -fsSI https://tournoi-palet.jimmydore.fr/health | head -1   # HEAD doit aussi répondre 200
ssh -o BatchMode=yes hetzner 'cd /root/tournoi-palet && git log -1 --oneline'   # le commit déployé
```

`/health` fait une vraie requête SQLite et ouvre un WebSocket vers le serveur lui-même ; un composant en panne répond `503` avec `"error"`.

**Lire les logs et l'état du conteneur** :

```sh
ssh -o BatchMode=yes hetzner 'docker logs --tail 100 tournoi-palet-web'
ssh -o BatchMode=yes hetzner "docker inspect -f '{{.State.Health.Status}}' tournoi-palet-web"
ssh -o BatchMode=yes hetzner 'tail -n 50 /var/log/tournoi-palet-backup.log'   # sauvegarde nocturne (04:00)
```

Les logs sont du JSON Fastify (une ligne par requête). Les données sont dans `/root/tournoi-palet-data/` sur l'hôte, montées en `/data`.
