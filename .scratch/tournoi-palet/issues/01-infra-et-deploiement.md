# 01: Infra, squelette de la stack et déploiement

**What to build:** Le site est en ligne sur `tournoi-palet.jimmydore.fr` avec une page « hello » servie par la vraie stack de la spec : client Vite + React + TypeScript, serveur Node, SQLite branché, canal WebSocket qui répond. Le repo GitHub public existe, et chaque push sur `main` redéploie automatiquement. Tout l'hébergement passe par `/new-project-hetzner` : DNS IONOS (saisi à la main par Jimmy), route Caddy dans RaveTycoon, Docker Compose sur le réseau partagé, GitHub Actions, sauvegarde R2, enregistrement sur le hub. La commande de tests et la vérification des types sont en place, pour que les tickets suivants travaillent en TDD.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] Repo GitHub public créé, avec le contenu actuel (docs, `.scratch`, assets, CLAUDE.md) commité sur `main`
- [ ] Stack initialisée sur le modèle de live-buzzer / music-bingo : client, serveur, SQLite, WebSocket, Dockerfile
- [ ] Commandes de test, de vérification des types et de build documentées dans CLAUDE.md
- [ ] `https://tournoi-palet.jimmydore.fr` affiche la page hello en HTTPS, et un endpoint de santé confirme que la base et le WebSocket répondent
- [ ] Un push sur `main` redéploie le site sans action manuelle (vérifié avec un vrai push)
- [ ] Sauvegarde R2 et enregistrement sur le hub faits selon le skill (ou désactivés explicitement)
- [ ] CLAUDE.md explique comment déployer et vérifier la prod, pour que les agents des tickets suivants puissent le faire seuls
