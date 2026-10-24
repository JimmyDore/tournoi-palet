# 07: Télé et téléphone en direct (poules)

**What to build:** Une page télé plein écran tourne seule entre « matchs en cours » (planche, équipe A contre équipe B, scores déjà saisis) et « classement des poules ». Le nom du tournoi, le logo, la charte CJVHB et un QR code vers le site restent affichés en permanence. Depuis la console, l'organisateur peut bloquer la télé sur une vue. Côté téléphone, le joueur choisit son équipe une fois (mémorisée dans le navigateur) et voit en haut de page sa prochaine planche, son adversaire, ses résultats et sa place, puis les vues générales. Tout se met à jour par WebSocket à chaque saisie, sans recharger la page.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Rotation automatique de la télé, et blocage d'une vue depuis la console
- [ ] QR code permanent qui pointe vers le site public
- [ ] Vue « mon équipe » sur téléphone, mémorisée après rechargement
- [ ] Un score saisi en console apparaît sur la télé et le téléphone sans rechargement (test serveur bout en bout via WebSocket)
- [ ] Lisible de loin sur la télé (grandes polices, fort contraste) et utilisable sur un petit écran de téléphone
- [ ] Déployé et vérifié en prod
