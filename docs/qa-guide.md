# Guide de recette : site du Concours de Palets du CJVHB

À suivre dans l'ordre d'une vraie journée, sur une **édition de test**. Prévoir environ 1 h 30. Il faut le PC (console), la vraie télé et ton téléphone.

État en prod au moment de l'écriture : commit `17f5f89`, tickets 02 à 17. Trois éditions de test terminées existent déjà (« Vérif prod 40 », « Vérif prod 48 », « Vérif prod 52 »), créées pendant la vérification de nuit. Elles sont invisibles côté public. Il n'y a pas de bouton pour supprimer une édition (voir les limites connues).

## 1. Adresses et connexion

| Face | URL | Accès |
|---|---|---|
| Console organisateur | https://tournoi-palet.jimmydore.fr/console | mot de passe partagé |
| Télé | `https://tournoi-palet.jimmydore.fr/tele/<id>` (`?k=…` pour une édition de test) | lien donné par la console, onglet **Liens publics** |
| Public / téléphone | https://tournoi-palet.jimmydore.fr/ (édition réelle en cours), `…/e/<id>` (`?k=…` pour une édition de test) | sans compte ; QR code sur la télé |
| Palmarès | https://tournoi-palet.jimmydore.fr/palmares | public |
| Santé | https://tournoi-palet.jimmydore.fr/health | `{"status":"ok","database":"ok","websocket":"ok"}` |

**Mot de passe** : dans le trousseau macOS.

```sh
security find-generic-password -s tournoi-palet-admin-password -w
```

À la connexion, le champ « Votre prénom » est facultatif : il est noté dans le journal à côté de chaque action. En local (`npm run dev` + `npm run dev:server`), le mot de passe est `admin`.

## 2. Parcours d'une journée

Coche chaque case quand le résultat attendu est bien là. En cas d'écart, note l'heure : le journal de l'édition (onglet **Journal**) permet de retrouver l'action.

### A. Préparer l'édition (ticket 02)

- [ ] **Connexion.** Ouvre la console, entre le mot de passe et ton prénom. → La liste des éditions s'affiche. Un mauvais mot de passe affiche « Mot de passe incorrect ».
- [ ] **Créer une édition de test.** « Nouvelle édition », nom « Recette Jimmy », une date, coche **édition de test**. → L'édition apparaît avec le badge « test ». Les réglages par défaut viennent de l'affiche 2025 : 13h/14h, salle Arc-en-Ciel, 18 €, 24 planches, plafond 48, 30 min, exempt 13-7.
- [ ] **Refus lisible.** Vide la date et enregistre. → Le moteur refuse avec une phrase en français, affichée sous le formulaire.
- [ ] **Réglages de tableau.** Dans **Réglages**, repère « méthode du 1er tour » (têtes de série / tirage), « rythme des tableaux » (synchronisés / au fil de l'eau) et « règle de répartition » (2/3 / Principal plein). → Les trois existent, avec leur valeur par défaut.
- [ ] **Invisible au public.** Dans une fenêtre de navigation privée, ouvre `/` et `/palmares`. → Aucune trace de « Recette Jimmy ».
- [ ] **Lien secret.** Onglet **Liens publics** : ouvre le lien téléphone (avec `?k=`) dans la fenêtre privée. → La page s'affiche avec le bandeau « Édition de test : visible seulement avec ce lien ». Enlève `?k=…` de l'URL. → « Édition introuvable ».
- [ ] **Deux PC.** Connecte-toi aussi sur un second navigateur (ou ton téléphone). → Les deux sessions restent ouvertes en même temps.

### B. Inscriptions (ticket 03)

- [ ] **Nom par défaut.** Onglet **Équipes**, « Inscrire une équipe » : joueurs « Pierre » et « Paul », nom vide. → L'équipe s'appelle « Pierre & Paul ».
- [ ] **Renommage.** Renomme-la « Les Mogettes ». → Le nouveau nom apparaît partout, y compris sur la page publique avec `?k=`, sans recharger.
- [ ] **Alerte licenciés.** Inscris une équipe avec les deux cases « licencié » cochées. → Une alerte jaune s'affiche, mais l'inscription passe.
- [ ] **Nom en double.** Inscris une autre équipe nommée « les mogettes ». → Refus lisible (casse et accents ignorés).
- [ ] **Liste d'attente.** Dans **Réglages**, mets le plafond à 3, puis inscris 2 équipes de plus (5 au total). → 3 inscrites et 2 en liste d'attente, dans l'ordre d'inscription.
- [ ] **Promotion.** Désinscris une équipe inscrite (confirmation). → La première de la liste d'attente remonte, et le journal le dit.
- [ ] **Page publique.** Avec le lien `?k=` : noms d'équipe, places restantes et liste d'attente. → Ni téléphone, ni commentaire, ni licence, ni paiement.

### C. Pointage (ticket 04)

- [ ] **Recherche + Entrée.** Onglet **Pointage**, tape quelques lettres d'un nom, puis Entrée. → L'équipe est pointée « présente et payée (18 €) », avec l'heure.
- [ ] **Compteur.** → Le compteur « pointées / inscrites » et la liste des manquantes se mettent à jour.
- [ ] **Liste d'attente.** Essaie de pointer une équipe en liste d'attente. → Refus lisible.
- [ ] **Remplacer un absent.** Sur une inscrite non pointée, « Absente : remplacer » (confirmation). → Elle sort, la tête de la liste d'attente prend sa place.
- [ ] **Dépointer.** Décoche une équipe pointée. → Dépointée en un clic, sans confirmation.
- [ ] **Remonter le plafond.** Remets le plafond à 48.

### D. Répétition générale : générer des équipes fictives (ticket 10)

- [ ] **Générer.** Onglet **Poules**, panneau « Répétition générale » : génère **43 équipes** (48 au total avec les 5 à la main ; pointe d'abord les tiennes). → 48 équipes pointées, avec des noms plausibles et variés.
- [ ] **Réservé au test.** Ce panneau n'existe pas sur une édition réelle (à vérifier plus tard sur une vraie édition, voir la partie 3).

### E. Partie 1 (ticket 05)

- [ ] **Lancer.** « Lancer la partie 1 » (la confirmation rappelle que le pointage sera clos). → 24 matchs, planches 1 à 24 dans le désordre, chaque équipe une seule fois.
- [ ] **Saisir.** Clique un match, tape 13, Tab, 9, Entrée. → Le score s'enregistre, le match n'est plus dans les « sans score », le classement bouge.
- [ ] **Refuser un score invalide.** Essaie 13-13, puis 14-2, puis -1. → Trois refus lisibles, rien n'est enregistré.
- [ ] **Victoire au temps.** Saisis 11-8. → Accepté.
- [ ] **Corriger.** Rouvre le premier match et passe-le à 10-13. → Le classement se recalcule seul, sans bouton « MAJ ». Le journal montre l'avant / après.
- [ ] **Pointage clos.** Retourne dans **Pointage**. → Pointer ou dépointer est refusé.
- [ ] **Désinscription bloquée.** Onglet **Équipes**. → Plus de bouton « Désinscrire » pour les équipes tirées (on passe par le forfait).
- [ ] **Remplir.** Panneau Répétition : « Remplir les scores ». → Tous les matchs restants ont un score, dont certains à moins de 13.

### F. Parties 2 à 4, forfait, nombre impair (ticket 06)

- [ ] **Forfait en poule.** Dans le classement, « Forfait » sur une équipe (confirmation). → Elle passe en bas avec un badge « forfait ».
- [ ] **Partie 2 impaire.** « Lancer la partie 2 ». → 47 équipes, donc un exempt qui gagne 13-7. Aucun adversaire de la partie 1 n'est revu.
- [ ] **Annuler un forfait.** Une fois la partie 2 tirée sans l'équipe forfait, le bouton « Annuler le forfait » n'apparaît plus.
- [ ] **Retrait de partie.** Remplis la partie 2, lance la partie 3, puis « Retirer la partie 3 ». → La confirmation dit précisément ce qui sera effacé. Après confirmation, la partie 3 disparaît et peut être relancée.
- [ ] **Parties 3 et 4.** Lance et remplis les parties 3 et 4. → Un exempt différent à chaque partie. La copie de sauvegarde automatique se fait à chaque partie terminée (elle n'est pas visible dans la console, voir ticket 09 plus bas).
- [ ] **Journal.** Onglet **Journal** : forfait, retrait, corrections, avec l'heure, ton prénom et l'avant / après.

### G. Chrono (ticket 08)

- [ ] **Lancer.** Bouton « Lancer le chrono » (onglet Poules ou Tableaux), mets 6 min pour aller vite. → Le chrono démarre sur la console, la télé et le téléphone, à la même seconde.
- [ ] **Alerte 5 min.** → Sous 5:00, le chrono passe en or (pulsation douce).
- [ ] **Dépassement.** Attends la fin (ou relance-le à 1 min). → Il continue en « +0:12 » sur fond rouge, et rien n'est bloqué : une saisie de score passe.
- [ ] **Arrêter / relancer.** → « Chrono arrêté », grisé. Relancer repart de zéro ; relancer un chrono qui tourne demande confirmation.
- [ ] **Rechargement.** Recharge la télé et le téléphone. → Même temps affiché qu'avant le rechargement.

### H. Télé et téléphone en direct (tickets 07, 15)

À faire sur la **vraie télé** et **ton téléphone**.

- [ ] **Télé.** Ouvre le lien télé de l'onglet **Liens publics** sur la télé, bouton « Plein écran ». → Logo, nom du tournoi, chrono, QR code et bandeau « Édition de test » restent affichés. La rotation passe toutes les 12 s des matchs en cours au classement des poules.
- [ ] **Lisible de loin.** Mets-toi au fond de la pièce. → Planches, noms et scores se lisent.
- [ ] **QR code.** Scanne-le avec ton téléphone. → La page de l'édition s'ouvre (le lien contient `?k=` puisque c'est une édition de test).
- [ ] **Mon équipe.** Choisis une équipe, puis recharge la page. → L'équipe est mémorisée. En haut : partie, planche, adversaire ; puis résultats et place.
- [ ] **En direct.** Saisis un score à la console. → Il apparaît sur la télé et sur le téléphone sans recharger.
- [ ] **Bloquer la télé.** Onglet **Télé** : bloque « Classement des poules », puis reviens en « Rotation automatique ». → La télé obéit tout de suite.
- [ ] **Largeur téléphone.** → Pas de défilement horizontal sur le téléphone.

### I. Répartition et tableaux (tickets 11, 12)

- [ ] **Répartition proposée.** Onglet **Tableaux**. → Proposition : 31 en Principal et 16 en Consolante (2/3 des 47 équipes hors forfait), avec un aperçu : taille, exempts, vrais matchs du 1er tour, taille des Challenges.
- [ ] **Refus.** Saisis 46 et valide. → Refus sous le champ, le champ revient à la répartition en vigueur, et « Générer » dit pourquoi il est grisé.
- [ ] **Valider puis générer.** Valide 31, puis « Générer les tableaux » (confirmation). → Principal de 32 avec 1 exempt (le 1er des poules), Consolante de 16. Les matchs du 1er tour reçoivent les planches 1 à 23.
- [ ] **Poules closes.** → Retrait de partie et annulation de forfait ne sont plus proposés.
- [ ] **Saisie.** Saisis un score de 1/16 à la main. Mêmes règles qu'en poule : essaie 13-13. → Refus.
- [ ] **Tours synchronisés.** Panneau Répétition : « Remplir les scores des matchs en cours ». → Le tour suivant ne part que quand le tour courant de ce tableau est complet. Les vainqueurs avancent seuls dans l'arbre.
- [ ] **Télé pendant les tableaux.** → La rotation montre les matchs de tableau en cours, le classement des poules, les tableaux formés et le classement provisoire. Bloque « Tableau Principal » : l'arbre de 32 est coupé en deux pages haut / bas pendant les 1/16 et les 1/8.
- [ ] **Téléphone pendant les tableaux.** → « Mon équipe » donne le tableau, le tour, la planche et l'adversaire, ou « en attente de l'adversaire », ou « direction le Challenge ».

### J. Corrections, forfait et matchs prêts en tableau (ticket 14)

- [ ] **Correction en cascade.** Dans un tour déjà suivi, corrige un 1/16 du Principal en inversant le vainqueur. → La boîte de confirmation détaille l'impact (« X remplace Y en 1/8 du Principal, planche N ; le score … sera effacé », Challenge refait). Après confirmation, l'arbre, le Challenge et le classement sont cohérents. Aucune planche n'est affichée deux fois.
- [ ] **Même vainqueur.** Corrige un score sans changer le vainqueur (13-5 → 13-7). → Aucune confirmation demandée.
- [ ] **Forfait en tableau.** « Forfait en tableau » sur une équipe encore en lice (confirmation). → Son adversaire avance 13-0 (« gagné par forfait »), et l'équipe est classée à sa place d'élimination.
- [ ] **Matchs prêts.** Quand un match du tour suivant a ses deux équipes connues alors que le tour n'est pas fini : « Lancer les matchs prêts (N) ». → Seuls ces matchs partent, avec une planche, ou en file s'il n'y en a plus.

### K. Challenges et classement final (ticket 13)

- [ ] **Challenges.** → Après le 1er tour du Principal, le Challenge Principal se forme avec ses perdants (l'exempt n'y est pas). Même chose pour la Consolante.
- [ ] **Jusqu'aux finales.** Remplis jusqu'au bout. → Les 4 tableaux ont un vainqueur.
- [ ] **Classement 1 à N.** Onglet **Classement**. → Places 1 à 48 sans trou ni doublon. Blocs dans l'ordre : Principal, Challenge Principal, Consolante, Challenge Consolante, puis le forfait de poule en dernier. Toutes les places sont « définitive ».
- [ ] **Départage.** Parmi les perdants d'un même tour (ex. les 8 perdants des 1/8), l'ordre suit le score de la défaite, puis le rang de poule.

### L. Lots (ticket 16)

- [ ] **Saisie.** Onglet **Réglages**, en bas, « Lots » : « 1 » → Jambon, « 2 » → Bouteille, « 3-4 » → Mogettes, « 5-16 » → Porte-clés. → Enregistré ; « places sans lot 17-48 » est signalé sans bloquer.
- [ ] **Chevauchement.** Ajoute « 4-8 » → … et enregistre. → Refus qui nomme les places en commun.
- [ ] **Colonne lot.** → Colonne « Lot » dans l'onglet Classement et dans le classement du téléphone, seulement pour les places définitives.
- [ ] **Ton lot.** Sur le téléphone, choisis une équipe classée 1 à 16. → « Ton lot : … » dans la carte de l'équipe.

### M. Export, sauvegarde, redémarrage (ticket 09)

- [ ] **Export.** « Exporter l'édition » en tête de l'édition. → Un fichier JSON lisible qui contient réglages, équipes, classements et événements.
- [ ] **Copies automatiques.** → Une copie par partie et par tour terminé :

  ```sh
  ssh -o BatchMode=yes hetzner 'ls /root/tournoi-palet-data/backups | tail'
  ```

- [ ] **Redémarrage sans perte.** Relance le déploiement :

  ```sh
  gh workflow run deploy.yml -R JimmyDore/tournoi-palet
  gh run list -R JimmyDore/tournoi-palet -L 1
  ```

  → Le conteneur est reconstruit et redémarré. Pendant ce temps, la télé et le téléphone affichent une reconnexion, puis reviennent seuls. La console est toujours connectée, et tout est identique : classement, tableaux, journal.
- [ ] **Autre PC.** Ouvre la console sur un autre appareil. → Même état exact.

### N. Palmarès public (ticket 17)

- [ ] **Page d'édition terminée.** Lien téléphone `?k=`. → Vainqueurs des 4 tableaux, classement final 1 à 48 avec les lots, les 4 tableaux repliables. Ta carte d'équipe montre ta place finale et ton lot.
- [ ] **Palmarès sans test.** `/palmares` en navigation privée. → Aucune édition de test (la liste est vide tant qu'aucune édition réelle n'est terminée).
- [ ] **API.** `curl -s https://tournoi-palet.jimmydore.fr/api/public/editions` → `[]`.

## 3. Cas limites à essayer

- [ ] **40 équipes.** Nouvelle édition de test, générer 40, tout remplir. → 2/3 donne 27 en Principal (tableau de 32, 5 exempts aux mieux classés), classement 1 à 40 complet.
- [ ] **52 équipes.** Générer 52, avec 24 planches. → En poule, 26 matchs pour 24 planches : 2 matchs « en attente de planche », qui prennent la première planche libérée. À la répartition, compare « 2/3 » (35 en Principal : tableau de 64 à 29 exempts et Challenge Consolante d'une équipe, l'aperçu le signale) et « Principal plein » (32/20). Classement 1 à 52 complet.
- [ ] **64 équipes.** Générer 64. → Plafond relevé seul jusqu'à 64 ; au-delà, refus. 32 matchs pour 24 planches en poule. Classement 1 à 64 complet.
- [ ] **Moins de planches que de matchs.** Édition à 6 planches. → Les matchs en trop sont « en attente de planche » sur la console, la télé (comptés à part) et le téléphone de l'équipe. Jamais deux matchs sur la même planche.
- [ ] **Correction en cascade sur deux niveaux.** Inverse un 1/16 dont le vainqueur a déjà gagné son 1/8 et dont le 1/4 est saisi. → L'impact liste les deux scores effacés ; après confirmation, le 1/8 et le 1/4 repartent à zéro.
- [ ] **Deux PC en même temps.** Deux consoles ouvertes sur la même édition, saisis sur l'une. → L'autre se met à jour seule. Lance « Lancer la partie N » sur les deux à la fois : une seule partie est créée, l'autre clic est refusé.
- [ ] **Rechargement de page.** Recharge la console en pleine saisie, la télé et le téléphone. → Tout revient exactement au même état (chrono compris).
- [ ] **Édition réelle.** Crée une édition **non test** (dans le futur), inscris 2 équipes. → Elle apparaît sur `/` sans lien secret, avec infos pratiques et inscrits, et sans panneau Répétition générale dans la console. Ensuite, coche « édition de test » (confirmation) pour la remasquer : un téléphone déjà ouvert sur `/` ne reçoit plus rien.

## 4. Décisions de la nuit et limites connues

### Récap de `docs/decisions-nuit.md`

Le détail est dans le fichier (une ligne par décision). Les plus visibles :

- **Éditions de test** : visibles seulement avec le lien secret `?k=…` donné par la console. C'est ce qui permet de répéter sur la vraie télé et les vrais téléphones sans rien publier.
- **Page d'accueil** : l'édition réelle la plus récente par date. Le palmarès ne liste que les éditions terminées.
- **Inscriptions** : noms d'équipe uniques. Une équipe en liste d'attente ne peut pas être pointée : il faut d'abord remplacer une absente. La liste d'attente est publique (noms seulement).
- **Pointage** : clos dès le lancement de la partie 1. Ensuite, désinscrire une équipe tirée est impossible, il faut la déclarer forfait.
- **Poules** : la partie suivante ne se lance que quand tous les scores sont saisis. Seule la dernière partie peut être retirée. Un forfait de poule s'annule tant qu'aucune partie n'a été tirée sans l'équipe.
- **Forfait de poule** : l'équipe ne va pas en tableau et finit en bas du classement final (à faire valider par Jean).
- **Tableaux** :
  - la répartition se valide une fois les 4 parties finies ;
  - générer les tableaux ferme les poules ;
  - les Challenges sont toujours en têtes de série ;
  - une file de planches est commune à tous les tableaux ;
  - tout changement de vainqueur demande confirmation ;
  - le forfait en tableau ne s'annule pas.
- **Réglages ajoutés pour Jean** : rythme des tableaux (synchronisés par défaut) et règle de répartition (2/3 par défaut, ou « Principal plein »).
- **Chrono** : un seul par édition, sans pause. Relancer repart de zéro.
- **Journal** : prénom déclaratif saisi à la connexion. Le mot de passe reste partagé.
- **Sauvegarde** : une copie SQLite à chaque partie ou tour terminé, 40 gardées par édition, dans `/root/tournoi-palet-data/backups`.

### Bugs et limites connus

- **Pas de suppression d'édition.** Les éditions de test s'accumulent dans la console : « Vérif prod 40/48/52 » de cette nuit, puis les tiennes. Elles restent invisibles côté public.
- **Journal chargé en répétition.** Chaque équipe fictive et chaque score tiré au hasard fait une ligne : une répétition à 64 équipes produit des centaines de lignes.
- **Répartition 2/3 à 52 équipes.** Elle donne un tableau de 64 à 29 exempts et un Challenge Consolante d'une seule équipe. La console le signale, et « Principal plein » ou une saisie à 32 corrige. À trancher avec Jean.
- **Sur téléphone (375 px)**, dans l'onglet Poules de la console, le tableau du classement défile sur le côté : le bouton « Forfait » est hors écran tant qu'on ne fait pas défiler.
- **Lien `?k=` d'une édition de test.** Toute personne qui a ce lien (ou qui scanne le QR code de la télé pendant une répétition) voit l'édition. C'est voulu pour répéter, mais ne pas projeter une édition de test pendant le vrai tournoi.
- **Tests navigateur.** Faits par agent-browser (Chrome) en 1920×1080 et 375 px. Rien n'a été essayé sur Safari iOS ni sur le navigateur de la télé : à vérifier sur ton matériel (étape H).

## 5. Ticket 18 : les 11 questions à poser à Jean avant le jour J

Elles viennent de `docs/grilling.md`. Ses réponses règlent des paramètres déjà prévus dans **Réglages**, ou ouvrent de nouveaux tickets.

1. **Q7, premier tour des tableaux** : tirage au sort, têtes de série (1 contre 32) ou la table figée du fichier A ? *(Réglage « méthode du 1er tour », têtes de série par défaut.)*
2. **Q14, répartition** : comment répartissez-vous Principale et Consolante quand vous n'avez pas 48 équipes ? *(Réglage « règle de répartition » : 2/3 ou Principal plein, ajustable à la main.)*
3. **Q17, rythme** : tours synchronisés, avec un bouton « Lancer les matchs prêts » pour ne pas attendre une partie trop longue ? *(Réglage « rythme des tableaux ».)*
4. **Q15, exempt** : score de l'équipe exempte en poule quand le nombre est impair (13-7 ?) *(Réglage « score d'exempt ».)*
5. **Q19/Q22, temps limite** : durée de la limite de temps, et règle quand le temps est écoulé (qui gagne, que faire en cas d'égalité ?) *(Réglage « durée d'une partie » ; l'égalité est refusée à la saisie.)*
6. **Q21, saisie des scores** : les joueurs viennent-ils annoncer leur score à la table, ou faut-il leur permettre de le saisir sur leur téléphone ? *(Pas fait ; nouveau ticket si oui.)*
7. **Q9, tirage des poules** : garder le tirage au hasard, ou passer à un tirage par niveau (système suisse) ? *(Hasard aujourd'hui.)*
8. **Lots** : liste des tranches de places et de leurs lots pour cette édition. *(Jean les saisit lui-même dans Réglages > Lots.)*
9. **Sponsors** à afficher sur la télé et sur la page publique ? *(Pas fait.)*
10. **Caution de 2 €** : c'est pour quoi, et faut-il suivre qui l'a récupérée ? *(Pas fait.)*
11. **Concours de déguisements** : vote du public sur téléphone, ou l'organisateur saisit les gagnants ? *(Pas fait.)*

À ajouter pour Jean, issu de la nuit : **une équipe forfait en poule doit-elle aller en tableau ?** Aujourd'hui, elle n'y va pas et finit dernière.
