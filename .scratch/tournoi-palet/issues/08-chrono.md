# 08: Chrono

**What to build:** L'organisateur lance le chrono d'une partie ou d'un tour, avec la durée réglée dans l'édition. Le chrono s'affiche en grand sur la télé et en petit sur les téléphones, avec une alerte visuelle à 5 minutes. Arrivé à zéro, il continue en dépassement (« +2:13 ») sans rien bloquer. L'organisateur peut l'arrêter ou le relancer.

**Blocked by:** 07

**Status:** resolved

- [x] Lancement, arrêt et relance depuis la console
- [x] Le chrono est calé sur l'heure du serveur : télé et téléphones affichent le même temps, même après un rechargement
- [x] Alerte visuelle à 5 minutes, affichage en dépassement après zéro
- [x] Aucune action n'est bloquée par le chrono
- [x] Déployé et vérifié en prod
