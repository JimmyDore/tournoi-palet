# 05: Partie 1 de poule, de bout en bout

**What to build:** L'organisateur lance la partie 1 : un tirage au hasard parmi les équipes pointées, avec une planche par match. Il clique sur un match et saisit les deux scores. Le site refuse les scores impossibles (égalité, au-delà de 13, négatif) mais accepte une victoire à moins de 13. La console montre les matchs sans score et le classement des poules en direct : victoires, puis points pour, puis différence, puis points contre.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Tirage de la partie 1 : chaque équipe pointée joue une seule fois, planches de 1 à N/2 attribuées au hasard (hasard injecté, test reproductible)
- [ ] Saisie d'un score avec validation, refus des scores invalides avec un message clair
- [ ] Liste des matchs en attente de score
- [ ] Classement des poules testé sur chacun de ses critères de départage
- [ ] Renommer une équipe pendant la partie ne change aucun résultat (test moteur)
- [ ] Déployé et vérifié en prod
