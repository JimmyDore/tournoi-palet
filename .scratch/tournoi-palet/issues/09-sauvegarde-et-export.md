# 09: Sauvegarde et export

**What to build:** Pendant le tournoi, l'état est copié automatiquement à chaque fin de partie de poule et de tour de tableau. L'organisateur peut exporter l'édition dans un fichier à tout moment. Après un redémarrage du serveur, ou depuis un autre PC, on retrouve exactement l'état en cours.

**Blocked by:** 05

**Status:** resolved

- [x] Copie automatique déclenchée par la fin d'une partie de poule (et branchée sur les tours de tableau quand ils existeront)
- [x] Bouton d'export qui télécharge l'édition complète dans un fichier lisible
- [x] Redémarrage du serveur en plein tournoi sans aucune perte (test serveur)
- [x] Déployé et vérifié en prod
