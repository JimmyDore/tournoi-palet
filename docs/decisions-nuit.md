# Décisions prises pendant la nuit (24 → 25 octobre 2026)

Prises sans pouvoir demander, au plus près de la spec et de `docs/grilling.md`. Une ligne par décision.

| Ticket | Choix fait | Pourquoi |
|---|---|---|
| 02 | Les faits stockés sont la liste ordonnée des événements de chaque édition (event sourcing) ; l'état et toutes les vues sont recalculés en les rejouant | C'est la forme la plus directe de « on ne stocke que les faits, tout est recalculé », et le journal en découle |
| 02 | Une édition de test n'est accessible côté public qu'avec un jeton secret dans l'URL (`?k=…`), que la console fournit pour la télé et le téléphone ; sans lui, 404 | Permet de répéter sur la vraie télé et les vrais téléphones sans que l'édition de test soit visible publiquement (spec : jamais publique) |
| 02 | Session console : cookie signé (HMAC), sans état côté serveur | Plusieurs PC en même temps, et la session survit à un redémarrage |
| 02 | La page publique `/` montre l'édition non test la plus récente (par date) | Il n'y a qu'un tournoi par an ; pas besoin d'un réglage « édition publiée » |
| 06 | Une équipe forfait en poule n'entre pas dans les tableaux et finit en bas du classement final | Évite des matchs fantômes en tableau ; le forfait en tableau, lui, la classe à sa place d'élimination (ticket 14) |
| 11 | Les Challenges sont toujours tirés en têtes de série d'après le classement des poules, quelle que soit la méthode du premier tour | Rend le Challenge entièrement recalculable à partir des résultats, sans nouveau tirage à stocker |
