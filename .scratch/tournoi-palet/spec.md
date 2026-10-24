# Spec : site du Concours de Palets du CJVHB

**Status:** ready-for-agent

Sources : `docs/analyse-excels.md` (fonctionnement des Excel actuels) et `docs/grilling.md` (décisions produit, questions ouvertes pour Jean).

## Problem Statement

Le club de handball CJVHB (Chantonnay) organise chaque année, vers décembre, un concours de palets en doublettes : environ 48 équipes, 24 planches, une après-midi. Tout se gère dans un Excel à macros conçu pour exactement 48 équipes :

- les équipes ne se renomment pas librement (les macros retrouvent une équipe par les chiffres de son libellé) ;
- des boutons « MAJ » sont à cliquer dans le bon ordre ;
- certains boutons dépendent de macros présentes seulement sur le PC de l'auteur ;
- le classement final affiche des `#N/A` ;
- un clic sur « Tirage au sort » en cours de tournoi efface tout ;
- dès qu'on n'a pas pile 48 équipes, il faut bricoler à la main.

Les joueurs, eux, doivent venir voir un tableau pour connaître leur planche et leur classement.

L'organisateur (Jean) veut un outil souple, rapide et fiable le jour J, qui ne demande aucune manipulation manuelle.

## Solution

Un site web, `tournoi-palet.jimmydore.fr`, avec trois faces :

1. **Console organisateur** (sur PC portable, protégée par mot de passe) :
   - avant le tournoi : préparer l'édition, inscrire les équipes au fil de l'eau ;
   - le jour J : pointer et encaisser, lancer les parties de poule, saisir et corriger les scores, lancer les tableaux, gérer les forfaits, saisir les lots.
2. **Écran télé** (plein écran) : rotation entre les matchs en cours, le classement des poules et les tableaux, avec en permanence le QR code vers le site et le chrono de la partie.
3. **Site public** (téléphone, sans connexion) :
   - avant le jour J : infos pratiques et liste des inscrits ;
   - pendant : même contenu que la télé, plus « mon équipe » (prochaine planche, adversaire) ;
   - après : classement final avec les lots et palmarès de chaque édition.

Le format reprend celui de l'Excel utilisé en 2025 :

- 4 parties de poule tirées au hasard, sans revoir un adversaire déjà joué ;
- classement des poules ;
- un **tableau Principal** et un **tableau Consolante**, chacun avec son **Challenge** qui récupère les perdants de son premier tour ;
- un classement final complet de 1 à N.

La différence : tout s'adapte à n'importe quel nombre d'équipes et tout se recalcule à chaque saisie ou correction.

## User Stories

### Préparer l'édition

1. En tant qu'organisateur, je veux créer une édition (nom, date, horaires, lieu, tarif, contact), pour que chaque année ait son tournoi et son palmarès.
2. En tant qu'organisateur, je veux créer une édition « de test », pour répéter le tournoi sans polluer le palmarès public.
3. En tant qu'organisateur, je veux régler le nombre de planches, pour coller au matériel disponible.
4. En tant qu'organisateur, je veux régler un plafond d'équipes, pour ne pas dépasser ce que les planches permettent.
5. En tant qu'organisateur, je veux régler la durée indicative d'une partie, pour que le chrono affiche le bon temps.
6. En tant qu'organisateur, je veux régler le score attribué à une équipe exempte (13-7 par défaut), pour suivre la règle du club.
7. En tant qu'organisateur, je veux définir des tranches de places associées à un lot (par exemple « 1 » → …, « 5-16 » → …), pour que chaque équipe connaisse son lot.
8. En tant qu'organisateur, je veux modifier les lots jusqu'à la fin du tournoi, pour m'adapter à ce que j'ai réellement reçu.
9. En tant qu'organisateur, je veux accéder à la console avec un mot de passe partagé, pour que seuls les organisateurs puissent modifier le tournoi.
10. En tant qu'organisateur, je veux pouvoir être connecté sur plusieurs PC en même temps, pour qu'on soit deux à la table de marque.

### Inscriptions

11. En tant qu'organisateur, je veux inscrire une équipe avec un nom d'équipe, deux joueurs, un téléphone facultatif et un commentaire, pour prendre les inscriptions par téléphone au fil des semaines.
12. En tant qu'organisateur, je veux que le nom d'équipe prenne par défaut la valeur « Joueur1 & Joueur2 » s'il est laissé vide, pour aller vite.
13. En tant qu'organisateur, je veux renommer une équipe à tout moment, même en plein tournoi, sans rien casser, pour régler le problème qui gênait dans l'Excel.
14. En tant qu'organisateur, je veux cocher « licencié » pour chaque joueur et recevoir une alerte non bloquante si les deux joueurs d'une doublette sont licenciés, pour appliquer la règle « un licencié maximum par doublette ».
15. En tant qu'organisateur, je veux que les inscriptions au-delà du plafond passent en liste d'attente, pour ne refuser personne trop tôt.
16. En tant qu'organisateur, je veux qu'une équipe de la liste d'attente prenne automatiquement une place libérée par un désistement, pour garder le tournoi plein.
17. En tant qu'organisateur, je veux désinscrire une équipe, pour gérer les désistements.
18. En tant qu'organisateur, je veux modifier une équipe (joueurs, téléphone, commentaire), pour corriger une erreur de saisie.

### Jour J : pointage

19. En tant qu'organisateur, je veux pointer une équipe comme présente et payée en une seule action quand elle passe à la table, pour que l'accueil aille vite.
20. En tant qu'organisateur, je veux voir combien d'équipes sont pointées et lesquelles manquent, pour savoir quand lancer le tournoi.
21. En tant qu'organisateur, je veux remplacer un inscrit absent par la première équipe de la liste d'attente, pour ne pas perdre de place.
22. En tant qu'organisateur, je veux que seules les équipes pointées entrent dans le tirage, pour que les absents ne faussent rien.

### Poules

23. En tant qu'organisateur, je veux lancer la partie 1 : un tirage au hasard qui attribue une planche à chaque match, pour démarrer le tournoi en un clic.
24. En tant qu'organisateur, je veux lancer la partie suivante une fois la précédente terminée, avec un tirage qui ne fait jamais rejouer deux équipes qui se sont déjà affrontées, pour respecter la règle.
25. En tant qu'organisateur, je veux qu'avec un nombre impair d'équipes, une équipe différente soit exempte à chaque partie et reçoive le score d'exempt réglé, pour ne pas bloquer le tirage.
26. En tant qu'organisateur, je veux qu'une partie déjà lancée ne puisse pas être retirée sans confirmation explicite, pour éviter la catastrophe du bouton « Tirage au sort » de l'Excel.
27. En tant qu'organisateur, je veux saisir le score d'un match en cliquant dessus et en tapant les deux scores, pour aller vite à la table.
28. En tant qu'organisateur, je veux que le site refuse un score impossible (égalité, plus de 13, négatif), pour éviter les fautes de frappe.
29. En tant qu'organisateur, je veux pouvoir saisir une victoire à moins de 13 (temps écoulé), pour gérer les parties arrêtées au chrono.
30. En tant qu'organisateur, je veux voir quels matchs de la partie en cours n'ont pas encore de score, pour savoir qui relancer.
31. En tant qu'organisateur, je veux corriger un score déjà saisi et voir le classement se recalculer tout seul, pour rattraper une erreur sans aucun bouton « MAJ ».
32. En tant qu'organisateur, je veux déclarer une équipe forfait, pour que ses adversaires suivants gagnent 13-0 et qu'elle ne soit plus tirée.
33. En tant qu'organisateur, je veux voir le classement des poules en direct (victoires, puis points pour, puis différence, puis points contre), pour suivre le tournoi.

### Chrono

34. En tant qu'organisateur, je veux lancer le chrono d'une partie ou d'un tour, pour que tout le monde voie le temps restant.
35. En tant qu'organisateur, je veux que le chrono continue après zéro (affichage en dépassement) sans rien bloquer, parce qu'on laisse parfois déborder.
36. En tant que joueur, je veux une alerte visuelle quand il reste 5 minutes, pour savoir qu'il faut accélérer.

### Tableaux

37. En tant qu'organisateur, je veux qu'à la fin des poules le site propose une répartition Principal / Consolante (2/3 et 1/3 par défaut), pour ne rien calculer à la main.
38. En tant qu'organisateur, je veux ajuster cette répartition avant de lancer les tableaux, pour appliquer la règle du club quel que soit le nombre d'équipes.
39. En tant qu'organisateur, je veux que les tableaux soient complétés par des exempts attribués aux mieux classés quand leur taille n'est pas une puissance de 2, pour gérer 40 ou 52 équipes sans bricolage.
40. En tant qu'organisateur, je veux que le premier tour soit tiré selon la méthode choisie (têtes de série par défaut), pour respecter la tradition du club.
41. En tant qu'organisateur, je veux que les perdants du premier tour du Principal alimentent le Challenge Principal, et ceux du premier tour de la Consolante le Challenge Consolante, pour que chacun continue à jouer.
42. En tant qu'organisateur, je veux qu'un vainqueur avance automatiquement au tour suivant, pour ne jamais recopier un nom.
43. En tant qu'organisateur, je veux que les tours soient synchronisés par défaut, et pouvoir lancer à la main les matchs dont les deux équipes sont déjà connues, pour ne pas attendre une partie interminable.
44. En tant qu'organisateur, je veux qu'un match lancé reçoive automatiquement une planche libre, et soit marqué « en attente » s'il n'y en a pas, pour gérer les planches sans y penser.
45. En tant qu'organisateur, je veux qu'une correction qui change le vainqueur d'un match de tableau m'avertisse de l'impact (le match suivant change d'équipe et repart à zéro s'il avait un score), puis s'applique après confirmation, pour corriger sans tout casser.
46. En tant qu'organisateur, je veux qu'un forfait en tableau fasse passer l'adversaire directement, pour continuer sans attendre.

### Classement final et lots

47. En tant qu'organisateur, je veux un classement final complet de 1 à N, tableaux et challenges compris, pour que chaque équipe ait une place.
48. En tant qu'organisateur, je veux que les perdants d'un même tour soient départagés automatiquement (score de la défaite, puis classement des poules), pour ne plus trancher à l'œil.
49. En tant qu'organisateur, je veux voir le lot de chaque équipe à côté de sa place, pour remettre les lots sans erreur.
50. En tant qu'organisateur, je veux exporter l'édition dans un fichier, pour garder une copie de sécurité.

### Journal

51. En tant qu'organisateur, je veux un journal des modifications (qui a fait quoi, quand, avant et après), pour trancher une contestation.

### Télé

52. En tant que spectateur, je veux une télé qui tourne seule entre les matchs en cours, le classement des poules et les tableaux, pour suivre le tournoi depuis la salle.
53. En tant qu'organisateur, je veux bloquer la télé sur une vue (par exemple le tableau pendant la finale), pour mettre en avant le moment fort.
54. En tant que joueur, je veux que le QR code du site soit affiché en permanence sur la télé, pour l'ouvrir sur mon téléphone à tout moment.
55. En tant que spectateur, je veux que la télé se mette à jour instantanément à chaque saisie, sans recharger la page, pour avoir l'information en direct.
56. En tant que spectateur, je veux voir le nom du tournoi et le logo du club aux couleurs du CJVHB (bleu pétrole, or, blanc), pour que l'affichage fasse officiel.

### Téléphone

57. En tant que joueur, je veux ouvrir le site depuis le QR code sans créer de compte, pour y accéder en une seconde.
58. En tant que joueur, je veux choisir mon équipe une fois et que le téléphone s'en souvienne, pour retrouver directement mes infos.
59. En tant que joueur, je veux voir en haut de page ma prochaine planche et mon adversaire, pour savoir où aller sans passer par la table.
60. En tant que joueur, je veux voir mes résultats et ma place actuelle, pour savoir où j'en suis.
61. En tant que joueur, je veux voir le classement des poules et les tableaux, pour suivre les autres équipes.
62. En tant que joueur, je veux voir le chrono de la partie en cours, pour gérer mon temps.
63. En tant que joueur, je veux voir « ton lot : … » dès que ma place est définitive, pour savoir ce que je vais chercher.
64. En tant que joueur, je veux que ma page se mette à jour toute seule, pour ne pas la recharger sans arrêt.

### Avant et après le tournoi

65. En tant que joueur, je veux voir avant le jour J les infos pratiques (date, horaires, lieu, tarif, contact), pour m'organiser.
66. En tant que joueur, je veux voir la liste des équipes inscrites (noms d'équipe seulement) et le nombre de places restantes, pour vérifier mon inscription sans appeler Jean.
67. En tant que joueur, je veux consulter le palmarès de chaque édition (classement final et tableaux), pour retrouver mes résultats des années précédentes.
68. En tant que joueur, je veux que les éditions de test n'apparaissent jamais publiquement, pour ne voir que les vrais tournois.

### Répétition générale

69. En tant qu'organisateur, je veux, dans une édition de test, générer N équipes fictives en un clic, pour répéter sans tout saisir.
70. En tant qu'organisateur, je veux, dans une édition de test, remplir au hasard les scores de la partie ou du tour en cours, pour dérouler un tournoi complet en quelques minutes.
71. En tant qu'organisateur, je veux vérifier sur une répétition que la télé, les téléphones et le classement final de 1 à N se comportent comme le jour J, pour arriver serein.

### Fiabilité

72. En tant qu'organisateur, je veux que l'état soit sauvegardé automatiquement pendant le tournoi, pour ne rien perdre si le serveur redémarre.
73. En tant qu'organisateur, je veux qu'une page rechargée ou un PC changé retrouve exactement l'état en cours, pour ne jamais dépendre d'un seul navigateur.

## Implementation Decisions

### Architecture

- **Stack** : Vite + React + TypeScript côté client, serveur Node côté back, base SQLite, mises à jour en temps réel par WebSocket. Le tout en Docker sur Hetzner, sous `tournoi-palet.jimmydore.fr`, sur le modèle de live-buzzer et music-bingo. Le déploiement et les sauvegardes passent par `/new-project-hetzner`.
- **Un seul module profond, le moteur du tournoi**, en TypeScript pur, sans base ni réseau ni horloge.
  - Son interface : un état d'édition, des **commandes** qui le font évoluer, et des **vues** calculées.
  - Commandes : créer/modifier une édition, inscrire, modifier, désinscrire, pointer, lancer une partie de poule, saisir ou corriger un score, déclarer un forfait, proposer puis valider la répartition, générer les tableaux, lancer les matchs prêts, définir les lots.
  - Vues : matchs en cours avec leurs planches, matchs en attente, classement des poules, tableaux, classement final avec les lots, prochaine planche d'une équipe.
  - Les commandes invalides sont refusées avec une raison lisible, que la console affiche.
- **On ne stocke que les faits** : édition, équipes, pointages, tirages, scores, forfaits, répartition validée, lots. Classements, tableaux, avancement des vainqueurs et places sont toujours **recalculés à partir des faits**. Une correction donne donc un état cohérent sans aucune mise à jour à déclencher.
- **Le hasard est injecté** (graine ou générateur passé au moteur), pour que les tirages soient reproductibles en test et que la répétition générale reste déterministe si besoin.
- **Le serveur est une couche mince** : il authentifie la console, applique les commandes au moteur, persiste les faits en SQLite, écrit le journal, puis diffuse le nouvel état par WebSocket aux télés et aux téléphones.
- **Identité des équipes** : identifiant interne stable. Le nom n'est qu'un affichage, renommable à tout moment.

### Règles métier

- **Score** : deux entiers de 0 à 13, différents. Le vainqueur est le plus haut, et peut avoir moins de 13 (temps écoulé). Toutes les parties se jouent en 13, finale comprise.
- **Classement des poules** : victoires, puis points pour, puis différence, puis points contre (tous décroissants sauf contre, croissant).
- **Tirage des poules** : partie par partie, au hasard, sans rejouer un adversaire. Avec un nombre impair, l'exempt change à chaque partie et reçoit le score réglé (13-7 par défaut). Un forfaité n'est plus tiré, et ses matchs restants sont gagnés 13-0 par l'adversaire.
- **Répartition** : par défaut 2/3 des équipes en Principal et le reste en Consolante, modifiable avant la génération.
- **Tableaux** : taille portée à la puissance de 2 supérieure, exempts aux mieux classés, premier tour selon la méthode réglée (têtes de série par défaut). Les perdants du premier tour d'un tableau alimentent son Challenge. Une équipe exempte au premier tour n'alimente pas le Challenge.
- **Classement final** : bloc Principal, puis Challenge Principal, puis Consolante, puis Challenge Consolante. Dans chaque bloc, un tour éliminé plus tard classe devant. À tour égal, on départage par le score de la défaite, puis par le classement des poules.
- **Planches** : attribuées au hasard en poule. En tableau, attribuées à la volée parmi les planches libres, avec une file « en attente » si besoin.
- **Rythme des tableaux** : tours synchronisés par défaut, plus une commande pour lancer les matchs dont les deux équipes sont déjà connues.
- **Corrections en tableau** : le moteur calcule l'impact (matchs aval qui changent, scores qui seront effacés). La console l'affiche, l'organisateur confirme, et la correction s'applique en effaçant les scores aval devenus invalides.
- **Réglages encore ouverts** (méthode du premier tour, règle de répartition, rythme, score d'exempt) : ce sont des paramètres de l'édition avec une valeur par défaut, à confirmer par Jean (`docs/grilling.md`).

### Console et accès

- Un mot de passe partagé, plusieurs sessions simultanées.
- Journal : horodatage, commande, valeurs avant/après.
- Les commandes destructrices (retirer une partie lancée, corriger un résultat de tableau) demandent une confirmation explicite.

### Public

- Pages publiques en lecture seule, sans compte. L'équipe choisie est mémorisée dans le navigateur.
- Ne sont jamais exposés publiquement : téléphones, paiement, licence, commentaires, éditions de test.
- Télé : rotation des vues, vue bloquable depuis la console, QR code permanent, chrono, logo et couleurs du CJVHB.

### Données et sauvegarde

- SQLite. Copie automatique pendant le tournoi (à chaque fin de partie de poule et de tour de tableau) + export de l'édition à la demande. La sauvegarde nocturne proposée par l'infra est optionnelle.

## Testing Decisions

- **Ce qu'est un bon test** : il passe par l'interface publique du moteur (commandes en entrée, vues en sortie) et décrit un comportement visible par l'organisateur ou le joueur. On ne teste aucune structure interne : un refactor du moteur ne doit casser aucun test.
- **Point de test principal : le moteur du tournoi.** Scénarios attendus :
  - 48 équipes, 4 parties : chaque équipe joue une fois par partie, aucun adversaire n'est revu, les planches vont de 1 à 24 ;
  - nombre impair : un exempt différent à chaque partie, avec le bon score ;
  - forfait en poule puis en tableau ;
  - classement des poules avec chaque critère de départage ;
  - répartition par défaut et ajustée ; 40 et 52 équipes : exempts aux mieux classés, Challenges correctement alimentés ;
  - avancement automatique des vainqueurs ; correction d'un match de tableau avec l'impact annoncé et appliqué ;
  - lancement des matchs prêts et attribution des planches avec file d'attente ;
  - classement final de 1 à N sans trou ni doublon, départages compris, lots attribués selon les tranches ;
  - renommage d'une équipe en plein tournoi sans effet sur les résultats ;
  - scores invalides refusés ;
  - **tournoi simulé complet** pour plusieurs tailles (au moins 16, 33, 40, 48, 52, 64) : il va au bout et donne un classement cohérent.
- **Point de test secondaire : le serveur, de bout en bout.** Quelques tests seulement : une commande envoyée par l'API console est persistée, survit à un redémarrage et arrive aux clients abonnés par WebSocket ; une requête console sans mot de passe est refusée ; les vues publiques ne contiennent aucune donnée privée.
- **Exemples existants** : aucun dans ce repo, qui est vide. Pour les tests serveur et temps réel, s'inspirer de live-buzzer et music-bingo (mêmes stack et WebSocket).

## Out of Scope

- Impressions et papier (feuilles de match, fiches de score) : la télé et les téléphones remplacent tout.
- Mode hors ligne : le réseau de la salle est fiable.
- Saisie des scores par les joueurs sur téléphone : à rediscuter selon la réponse de Jean.
- Formulaire d'inscription public et paiement en ligne : Jean saisit les inscriptions.
- Suivi de la caution de 2 €, sponsors, concours de déguisements : en attente des réponses de Jean.
- Reprise des équipes d'une édition à l'autre.
- Mode « remise des lots » sur la télé.
- Comptes individuels pour les organisateurs, multi-club, ouverture à d'autres organisateurs.
- Tirage des poules par niveau (système suisse) : possible plus tard sous forme d'option d'appariement.
- Un 3ᵉ tableau (format du fichier B, jusqu'à 96 équipes) : le plafond est 64.

## Further Notes

- Échéance : un tournoi vers début décembre 2026, soit environ 6 semaines à partir du 24 octobre. La répétition générale doit être faite avec Jean avant le jour J.
- Une issue finale (« Réponses de Jean ») reprend les 11 questions ouvertes de `docs/grilling.md`. Ses réponses ne font que régler des paramètres déjà prévus, ou ajouter des fonctions hors périmètre si Jean les demande.
- Charte : logo dans `assets/logo-cjvhb.png`, couleurs bleu pétrole / or / blanc reprises de l'affiche 2025 (« Concours de Palets du CJVHB », salle Arc-en-Ciel, Chantonnay).
