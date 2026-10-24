# 13: Challenges et classement final de 1 à N

**What to build:** Les perdants du premier tour du Principal alimentent le Challenge Principal, et ceux du premier tour de la Consolante le Challenge Consolante (une équipe exempte au premier tour n'y va pas). Les Challenges se jouent comme des tableaux. Le site calcule le classement final complet de 1 à N, dans cet ordre : bloc Principal, Challenge Principal, Consolante, Challenge Consolante. Dans chaque bloc, une équipe éliminée plus tard est classée devant. À tour égal, on départage par le score de la défaite, puis par le classement des poules.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] Les deux Challenges sont alimentés et se jouent jusqu'à leur finale
- [ ] 48 équipes : places 1-16 Principal, 17-32 Challenge Principal, 33-40 Consolante, 41-48 Challenge Consolante (comme l'Excel 2025)
- [ ] Départage des perdants d'un même tour testé (score de la défaite, puis classement des poules)
- [ ] Tournoi simulé complet pour 16, 33, 40, 48, 52 et 64 équipes : classement de 1 à N sans trou ni doublon
- [ ] Classement final visible dans la console
- [ ] Déployé et vérifié en prod
