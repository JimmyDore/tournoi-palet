# 10: Répétition générale (poules)

**What to build:** Dans une édition de test, l'organisateur génère N équipes fictives (déjà pointées) en un clic, puis remplit au hasard les scores de la partie en cours, pour dérouler les poules en quelques minutes et former Jean à l'outil. Ces commandes sont refusées sur une vraie édition.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Génération de N équipes fictives, réservée aux éditions de test
- [ ] Remplissage aléatoire des scores de la partie en cours, avec des scores valides et parfois des victoires à moins de 13
- [ ] Test qui simule les 4 parties de poule pour 16, 33, 40, 48, 52 et 64 équipes, sans erreur et avec un classement cohérent
- [ ] Déployé et vérifié en prod
