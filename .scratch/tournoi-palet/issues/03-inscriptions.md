# 03: Inscriptions et liste d'attente

**What to build:** L'organisateur inscrit des équipes au fil des semaines : nom d'équipe (par défaut « Joueur1 & Joueur2 » si laissé vide), joueur 1, joueur 2, case licencié par joueur, téléphone facultatif, commentaire. Il les modifie, les renomme et les désinscrit. Une alerte non bloquante s'affiche si les deux joueurs sont licenciés. Au-delà du plafond, les équipes passent en liste d'attente, et la première remonte automatiquement quand une place se libère. La page publique liste les noms d'équipe inscrits et le nombre de places restantes, sans aucune donnée privée.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Inscription, modification, renommage, désinscription depuis la console
- [ ] Nom par défaut généré à partir des joueurs
- [ ] Alerte « deux licenciés » affichée, inscription quand même possible
- [ ] Liste d'attente au-delà du plafond, avec promotion automatique au désistement (test moteur)
- [ ] La page publique montre noms d'équipe et places restantes, sans téléphone, paiement, licence ni commentaire (test serveur)
- [ ] Déployé et vérifié en prod
