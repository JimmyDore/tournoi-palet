# 02: Édition et page publique

**What to build:** L'organisateur se connecte à la console avec le mot de passe partagé (plusieurs sessions possibles en même temps). Il crée et modifie une édition : nom, date, horaires, lieu, tarif, contact, nombre de planches, plafond d'équipes, durée indicative d'une partie, score d'exempt, et un indicateur « édition de test ». La page publique affiche les infos pratiques de l'édition en cours, avec le logo et les couleurs du CJVHB (bleu pétrole, or, blanc). Ce ticket pose le moteur du tournoi (commandes → faits → vues recalculées) et le serveur mince qui persiste les faits et applique les commandes. Voir la spec, Implementation Decisions.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Le moteur expose commandes et vues. Une commande invalide est refusée avec une raison lisible, affichée par la console
- [ ] Console inaccessible sans mot de passe (test serveur)
- [ ] Création et modification d'une édition, persistées et intactes après un redémarrage du serveur
- [ ] La page publique montre les infos pratiques avec la charte CJVHB, et reste lisible sur téléphone
- [ ] Une édition de test n'est jamais visible publiquement
- [ ] Déployé et vérifié en prod
