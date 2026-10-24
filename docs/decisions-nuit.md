# Décisions prises pendant la nuit (24 → 25 octobre 2026)

Prises sans pouvoir demander, au plus près de la spec et de `docs/grilling.md`. Une ligne par décision.

| Ticket | Choix fait | Pourquoi |
|---|---|---|
| 02 | Les faits stockés sont la liste ordonnée des événements de chaque édition (event sourcing) ; l'état et toutes les vues sont recalculés en les rejouant | C'est la forme la plus directe de « on ne stocke que les faits, tout est recalculé », et le journal en découle |
| 02 | Une édition de test n'est accessible côté public qu'avec un jeton secret dans l'URL (`?k=…`), que la console fournit pour la télé et le téléphone ; sans lui, 404 | Permet de répéter sur la vraie télé et les vrais téléphones sans que l'édition de test soit visible publiquement (spec : jamais publique) |
| 02 | Session console : cookie signé (HMAC), sans état côté serveur | Plusieurs PC en même temps, et la session survit à un redémarrage |
| 02 | La page publique `/` montre l'édition non test la plus récente (par date) | Il n'y a qu'un tournoi par an ; pas besoin d'un réglage « édition publiée » |
| 02 | Réglages par défaut d'une nouvelle édition repris de l'affiche 2025 : accueil 13h00, début 14h00, salle Arc-en-Ciel à Chantonnay, 18 € par doublette, 24 planches, plafond 48, partie de 30 min, exempt 13-7, 1er tour des tableaux en têtes de série ; contact vide | Jean n'a plus qu'à saisir le nom et la date ; tout reste modifiable |
| 02 | La date de l'édition est obligatoire (vraie date AAAA-MM-JJ) | Elle sert à désigner l'édition en cours sur la page d'accueil |
| 02 | Le « contact » est public | C'est le contact d'inscription de l'affiche (Jean), pas le téléphone d'une équipe |
| 02 | Le hasard du serveur est cryptographique (pas de graine) ; les tests utilisent `seededRng` | Le jeton d'une édition de test est tiré dans `decide` : une graine de 32 bits le rendrait devinable. Le rejouage n'en dépend pas puisque le résultat est dans l'événement |
| 02 | Seul le moteur valide les réglages : les formulaires de la console sont en `noValidate` et affichent le refus du moteur tel quel | Une seule source de vérité ; la validation native du navigateur masquait la raison lisible |
| 02 | Décocher « édition de test » demande une confirmation dans la page | L'édition devient alors publique (page d'accueil, palmarès) |
| 02 | Le journal est dérivé des événements (`describeEvent`), sans table dédiée ni « qui » | Mot de passe partagé, donc pas d'identité ; l'horodatage et l'avant/après suffisent |
| 02 | Session console valable 30 jours ; en production le serveur refuse de démarrer sans `ADMIN_PASSWORD` | Pas de reconnexion le jour J ; le mot de passe local `admin` ne doit jamais servir en prod |
| 06 | Une équipe forfait en poule n'entre pas dans les tableaux et finit en bas du classement final | Évite des matchs fantômes en tableau ; le forfait en tableau, lui, la classe à sa place d'élimination (ticket 14) |
| 11 | Les Challenges sont toujours tirés en têtes de série d'après le classement des poules, quelle que soit la méthode du premier tour | Rend le Challenge entièrement recalculable à partir des résultats, sans nouveau tirage à stocker |
