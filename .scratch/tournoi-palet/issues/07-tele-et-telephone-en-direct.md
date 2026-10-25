# 07: Télé et téléphone en direct (poules)

**What to build:** Une page télé plein écran tourne seule entre « matchs en cours » (planche, équipe A contre équipe B, scores déjà saisis) et « classement des poules ». Le nom du tournoi, le logo, la charte CJVHB et un QR code vers le site restent affichés en permanence. Depuis la console, l'organisateur peut bloquer la télé sur une vue. Côté téléphone, le joueur choisit son équipe une fois (mémorisée dans le navigateur) et voit en haut de page sa prochaine planche, son adversaire, ses résultats et sa place, puis les vues générales. Tout se met à jour par WebSocket à chaque saisie, sans recharger la page.

**Blocked by:** 05

**Status:** resolved

- [x] Rotation automatique de la télé, et blocage d'une vue depuis la console
- [x] QR code permanent qui pointe vers le site public
- [x] Vue « mon équipe » sur téléphone, mémorisée après rechargement
- [x] Un score saisi en console apparaît sur la télé et le téléphone sans rechargement (test serveur bout en bout via WebSocket)
- [x] Lisible de loin sur la télé (grandes polices, fort contraste) et utilisable sur un petit écran de téléphone
- [x] Déployé et vérifié en prod
