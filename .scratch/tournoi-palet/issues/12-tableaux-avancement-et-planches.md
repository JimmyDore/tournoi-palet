# 12: Tableaux : avancement et planches

**What to build:** Un vainqueur avance automatiquement au tour suivant. Les tours sont synchronisés par défaut : quand un tour est complet dans un tableau, les matchs suivants sont lancés. À chaque match lancé, une planche libre est attribuée. S'il n'y en a pas, le match apparaît « en attente » et reçoit la prochaine planche qui se libère. Les tableaux vont jusqu'à leur finale (en 13). La simulation de la répétition générale s'étend aux tours de tableau.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Avancement automatique jusqu'au vainqueur de chaque tableau
- [ ] Tours synchronisés : le tour N+1 démarre quand le tour N est complet
- [ ] Attribution des planches libres, avec file « en attente » quand il en manque (test avec moins de planches que de matchs)
- [ ] Le remplissage aléatoire de la répétition générale fonctionne sur les tours de tableau
- [ ] Déployé et vérifié en prod
