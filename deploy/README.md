# Déploiement du tournoi de palets

Production : https://tournoi-palet.jimmydore.fr, sur le VPS Hetzner `77.42.23.215`
(alias SSH `hetzner`), à côté des autres stacks Docker.

## Comment ça marche

Chaque push sur `main` lance `.github/workflows/deploy.yml` :

1. **test** : `npm ci`, `npm run typecheck`, `npm test` puis `npm run build` sur Node 24.
2. **deploy** (si les tests passent) :
   - vérifie que `ADMIN_PASSWORD` est présent et ne contient ni antislash ni
     retour à la ligne ;
   - se connecte en SSH à `root@77.42.23.215` avec la clé `DEPLOY_SSH_KEY` ;
   - clone le dépôt public en HTTPS dans `/root/tournoi-palet` (ou `git fetch` +
     `git checkout -B main origin/main` s'il existe déjà) ;
   - écrit `/root/tournoi-palet/.env` (mode 600, les secrets de l'app) en l'envoyant
     par stdin SSH ;
   - crée `/root/tournoi-palet-data` (uid 1000, mode 700) ;
   - `docker compose up -d --build --remove-orphans` puis `docker image prune -f` ;
   - attend que les conteneurs soient sains, vus depuis le serveur ;
   - si les secrets R2 sont là, écrit `/root/.tournoi-palet-backup.env` et installe
     `/etc/cron.d/tournoi-palet-backup` ; sinon, supprime les deux.
3. **health** : attend jusqu'à 150 s que `https://tournoi-palet.jimmydore.fr/health`
   réponde 200 en GET et en HEAD.

Le conteneur `tournoi-palet-web` écoute sur le port 8787 sans le publier. Il
rejoint le réseau Docker externe `ravetycoon_default`, où le Caddy partagé le
trouve par son nom. Les autres variables sont dans `docker-compose.yml`.

`/health` (GET et HEAD) lance une requête SQLite et ouvre un vrai WebSocket
vers `/ws` du serveur lui-même. Il répond `200 {"status":"ok","database":"ok","websocket":"ok"}`,
ou `503` avec le composant en `error`.

Pour redéployer sans nouveau commit : onglet Actions, « Deploy to Hetzner »,
« Run workflow » (ou `gh workflow run deploy.yml -R JimmyDore/tournoi-palet`).

## Secrets GitHub Actions

| Secret | Rôle |
|---|---|
| `DEPLOY_SSH_KEY` | clé privée SSH dédiée (`~/.ssh/deploy_tournoi-palet`, commentaire `github-actions-tournoi-palet`) ; sa clé publique est dans `/root/.ssh/authorized_keys` sur le serveur |
| `DEPLOY_KNOWN_HOSTS` | sortie de `ssh-keyscan -t ed25519,rsa,ecdsa 77.42.23.215` |
| `ADMIN_PASSWORD` | secret de l'app (ni antislash ni retour à la ligne) |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | accès au bucket Cloudflare R2 `hetzner-backups` (les mêmes que les autres projets) |
| `SLACK_WEBHOOK_URL` | alerte Slack si une sauvegarde échoue (facultatif) |

Sans les trois secrets R2, le déploiement marche mais les sauvegardes sont
désactivées.

## Ce qui vit hors de ce dépôt

- **DNS** : enregistrement A `tournoi-palet.jimmydore.fr → 77.42.23.215` chez IONOS.
- **Reverse proxy / TLS** : la route
  `tournoi-palet.jimmydore.fr { reverse_proxy tournoi-palet-web:8787 }` est dans
  `deploy/Caddyfile` du dépôt **RaveTycoon**. On la modifie là-bas (commit +
  push, le déploiement de RaveTycoon recrée Caddy), jamais à la main sur le
  serveur : un Caddyfile cassé coupe tous les sites du VPS. Valider avant de
  pousser :
  `docker run --rm -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile`.
- **Sur le serveur** : `/root/tournoi-palet/.env`, `/root/tournoi-palet-data/`,
  `/root/.tournoi-palet-backup.env`, `/etc/cron.d/tournoi-palet-backup`,
  `/var/log/tournoi-palet-backup.log`.

## Sauvegardes

Tous les jours à 04:00 (heure du serveur), `deploy/backup.sh` :

1. demande au conteneur un snapshot cohérent :
   `docker exec tournoi-palet-web node scripts/backup.mjs /data/snapshot.db` ;
2. l'envoie avec rclone (conteneur éphémère) vers
   `r2:hetzner-backups/tournoi-palet/<AAAAMMJJ_HHMMSS>/tournoi-palet.db` ;
3. supprime les sauvegardes de plus de 365 jours sous `tournoi-palet/` ;
4. supprime le snapshot local.

Slack n'est prévenu qu'en cas d'échec. Lancer une sauvegarde à la main et lire
les logs :

```sh
ssh hetzner /root/tournoi-palet/deploy/backup.sh
ssh hetzner tail -n 50 /var/log/tournoi-palet-backup.log
```

## Restaurer une sauvegarde

Sur le serveur (`ssh hetzner`) :

```sh
ENV=/root/.tournoi-palet-backup.env

# 1. Lister les sauvegardes et choisir une date
docker run --rm --env-file $ENV rclone/rclone:1 lsd r2:hetzner-backups/tournoi-palet

# 2. La télécharger
D=20260918_023000   # à adapter
mkdir -p /root/tournoi-palet-restore
docker run --rm --env-file $ENV -v /root/tournoi-palet-restore:/restore \
  rclone/rclone:1 copy "r2:hetzner-backups/tournoi-palet/$D/" /restore/

# 3. Arrêter l'app et mettre les données actuelles de côté
cd /root/tournoi-palet
docker compose stop tournoi-palet-web
mkdir -p /root/tournoi-palet-data/avant-restauration
```

```sh
mv /root/tournoi-palet-data/tournoi-palet.db* /root/tournoi-palet-data/avant-restauration/

# 4. Mettre la sauvegarde en place (propriétaire uid 1000) et redémarrer
install -o 1000 -g 1000 -m 600 /root/tournoi-palet-restore/tournoi-palet.db /root/tournoi-palet-data/tournoi-palet.db
docker compose start tournoi-palet-web
curl -fsS https://tournoi-palet.jimmydore.fr/health
```

Quand tout est vérifié, supprimer `/root/tournoi-palet-restore` et
`/root/tournoi-palet-data/avant-restauration`.

## Secrets de l'app

Ils sont rangés dans le trousseau macOS (session) :

```sh
security find-generic-password -s tournoi-palet-admin-password -w
```

Pour en changer un : générer une nouvelle valeur, la mettre dans le trousseau
(`security add-generic-password -U -s tournoi-palet-admin-password -a ADMIN_PASSWORD -w`,
qui la demande), dans le secret
(`security find-generic-password -s tournoi-palet-admin-password -w | gh secret set ADMIN_PASSWORD -R JimmyDore/tournoi-palet`),
puis relancer le workflow.
