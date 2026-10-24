# Grilling : site du tournoi de palet

Contexte : `docs/analyse-excels.md`. Tournoi prévu vers début décembre 2026.

## Décisions prises

| # | Sujet | Décision |
|---|---|---|
| Q1 | Délai | Environ 1 mois et demi. On vise un outil complet, pas une version au rabais |
| Q2 | Utilisateurs | Les organisateurs saisissent. Affichage public en lecture seule sur la télé et sur les téléphones (QR code) |
| Q3 | Portée | Plusieurs éditions (une par année) pour ce seul club, plus un tournoi de test possible |
| Q4 | Nombre d'équipes | N'importe quel nombre (plafond 64), 2 tableaux, exempts si besoin |
| Q5 | Inscriptions | Saisies par l'organisateur au fil de l'eau avant le tournoi, avec suivi « payé » |
| Q6 | Matériel | PC portable, réseau fiable (pas de mode hors ligne), une télé pour le grand affichage |
| Q8 | Départage des places à égalité | Automatique : score de la défaite, puis classement des poules |
| Q9 | Poules | Tirage partie par partie, au hasard, sans revoir un adversaire déjà joué (reco, non contestée) |
| Q10 | Fiche équipe | Nom libre et modifiable (par défaut « J1 & J2 »), joueur 1, joueur 2, téléphone (facultatif), payé, commentaire (reco, non contestée) |
| Q11 | Accès organisateur | Mot de passe partagé, plusieurs PC possibles, journal des modifications (reco, non contestée) |
| Q12 | Télé | Rotation : matchs en cours, classement des poules, tableaux. Vue bloquable. **QR code affiché en permanence** |
| Q13 | Téléphone | Même contenu que la télé + « mon équipe » : prochaine planche et adversaire (reco, non contestée) |
| Q14 | Répartition Principale / Consolante | Calculée automatiquement, **ajustable par l'organisateur** avant de lancer les tableaux. Règle par défaut à confirmer (voir plus bas) |
| Q16 | Forfait | Marqué par l'organisateur. En poule, l'adversaire gagne 13-0. En tableau, l'adversaire passe (reco, non contestée) |
| Q18 | Papier | **Aucun.** La télé et les téléphones remplacent tout |
| Q19 | Scores | Vainqueur = score le plus haut, 13 maximum, pas d'égalité. On peut gagner à moins de 13 (temps limite) |
| Q20 | Stack | Vite + React + TypeScript, serveur Node, SQLite, WebSocket, Docker sur Hetzner |
| Q21 | Remontée des scores | Les joueurs annoncent le score à la table, l'organisateur le saisit (à confirmer avec le pote) |
| Q22 | Chrono | Compte à rebours lancé par l'organisateur, durée réglable, **indicatif seulement** : on peut le laisser déborder, rien ne se bloque |
| Q23 | Plafond | Plafond réglable + liste d'attente |
| Q24 | Pointage | Le jour J, chaque équipe passe à la table pour payer et se signaler : pointage et paiement en une seule action. Seules les équipes pointées sont tirées |
| Q25 | Archives | Palmarès public de chaque édition (classement final + tableaux) |
| Q26 | Correction d'un score en tableau | Le site prévient de l'impact, puis met à jour le match suivant après confirmation (reco, non contestée) |
| Q27 | Reprise des équipes d'une édition à l'autre | Non |
| Q28 | Répétition générale | Bouton réservé aux tournois de test : crée N équipes fictives et remplit des scores au hasard |
| Q29 | Identité | « Concours de Palets du CJVHB », logo dans `assets/logo-cjvhb.png`, couleurs bleu pétrole / or / blanc |
| Q30 | Adresse | `tournoi-palet.jimmydore.fr` |
| Q31 | Règle « 1 licencié max par doublette » | Case « licencié » par joueur, alerte non bloquante si les deux sont cochés (reco, non contestée) |
| Q32 | Paiement | Une seule case « payé (18 €) » au pointage, caution gérée hors du site (reco, non contestée) |
| Q34 | Page publique avant le jour J | Infos de l'affiche + liste des équipes inscrites (nom d'équipe seulement) + places restantes |
| Q35 | Lots | L'organisateur saisit des tranches de places avec un libellé (« 1 » → …, « 5-16 » → …), modifiables jusqu'au dernier moment |
| Q36 | Affichage des lots | Colonne « lot » dans le classement final et le palmarès + « ton lot » sur le téléphone de l'équipe quand sa place est définitive. Pas de mode remise des lots sur la télé |
| Sauvegarde | | SQLite, copie automatique pendant le tournoi + export à la demande |

Rappel de l'affiche 2025 : 20 décembre, arrivée 13h, début 14h, salle Arc-en-Ciel à Chantonnay, inscription auprès de Jean.

## À demander au pote (à reposer avant de clore)

1. **Q7** : premier tour des tableaux. Tirage au sort, têtes de série (1 contre 32) ou la table figée du fichier A ?
2. **Q14** : comment répartissez-vous Principale et Consolante quand vous n'avez pas 48 équipes ?
3. **Q17** : tours synchronisés, avec un bouton « Lancer les matchs prêts » pour ne pas attendre une partie trop longue ?
4. **Q15** : score de l'équipe exempte en poule quand le nombre est impair (13-7 ?)
5. **Q19/Q22** : durée de la limite de temps, et règle quand le temps est écoulé (qui gagne, que faire en cas d'égalité ?)
6. **Q21** : les joueurs viennent-ils annoncer leur score à la table, ou faut-il leur permettre de le saisir sur leur téléphone ? (Jimmy n'est pas très chaud : si l'autre équipe part sans confirmer, c'est pénible. Mais ça pourrait faire gagner du temps.)
7. **Q9** : garder le tirage des poules au hasard, ou passer à un tirage par niveau (système suisse) ?
8. Lots par place : liste des tranches de places et de leurs lots pour cette édition (le principe est validé, il reste le contenu)
9. Sponsors à afficher sur la télé et sur la page publique ?
10. Caution de 2 € : c'est pour quoi, et faut-il suivre qui l'a récupérée ?
11. Concours de déguisements : faut-il un vote du public sur téléphone (sujet de discorde l'an dernier), ou l'organisateur saisit-il les gagnants ?
