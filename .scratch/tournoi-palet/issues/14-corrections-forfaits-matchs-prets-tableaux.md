# 14: Corrections, forfaits et matchs prêts en tableau

**What to build:** Si l'organisateur corrige le résultat d'un match de tableau et que le vainqueur change, la console affiche d'abord l'impact : « X remplace Y en 1/8 planche 4, le score 13-9 déjà saisi sera effacé ». La correction s'applique après confirmation. Un forfait en tableau fait passer l'adversaire directement. Un bouton « Lancer les matchs prêts » démarre tout match du tour suivant dont les deux équipes sont déjà connues, sans attendre la fin du tour.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] Impact d'une correction calculé par le moteur et affiché avant confirmation
- [ ] Correction appliquée en cascade : les scores aval devenus invalides sont effacés, classement et tableaux restent cohérents (test moteur)
- [ ] Forfait en tableau : l'adversaire avance, et le forfaité est classé à sa place d'élimination
- [ ] « Lancer les matchs prêts » ne démarre que les matchs dont les deux équipes sont connues, avec attribution de planche
- [ ] Déployé et vérifié en prod
