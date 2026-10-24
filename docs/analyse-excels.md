# Analyse des deux Excel du tournoi de palet

Sources (dans `~/Downloads`) :

- **Fichier A** : `Concours à 48 Equipes (1).xlsm`, celui utilisé l'an dernier (« CLASSEMENT SAINTE GEMME 2025/2026 »).
- **Fichier B** : `concours (pas pris l'année derniere).xlsm`, reçu trop tard, prévu pour 96 équipes max.

Règles communes aux deux : équipes de 2 joueurs, parties en 13 points sur une planche (« plaque »), pas de match nul, 4 parties de poule puis tableaux à élimination directe. Les perdants ne sortent jamais tout de suite : chaque tableau a un « challenge » qui récupère les perdants du premier tour, si bien que **chaque équipe joue au moins 6 parties** et que **toutes les places de 1 à N sont classées**.

---

## Fichier A : 48 équipes (celui de l'an dernier)

### Déroulé

| # | Onglet | Rôle |
|---|---|---|
| 0 | PRESENTATION | Mode d'emploi en zone de texte (« activer les macros ») |
| 1 | LISTE PARTICIPANTS | Saisie : n° équipe 1-48 + « Nom et Nom » + colonne « ok » |
| 2 | EQUIPES | Liste « Equipe 1 … Equipe 48 » lue par la macro de tirage |
| 3 | POULES | Bouton **TIRAGE AU SORT** → génère les 96 matchs (4 parties × 24 planches). On y saisit Score A / Score B |
| 4 | IMPRESSIONS | Feuilles à imprimer : pour chaque partie, Équipe A / Planche / Équipe B |
| 5 | PHASE DE GROUPE | Bouton **MAJ PHASE DE GROUPE** → recopie les scores de POULES par équipe : P/C par partie, total pour, total contre, +/-, nb victoires |
| 6 | Classement PHASE DE GROUPE | Bouton **MAJ** → trie : victoires ↓, points marqués ↓, différence ↓ |
| 7 | 1- PRINCIPALE | Rangs 1-32 → 1/16, 1/8, 1/4, 1/2, finale |
| 8 | 2- CHALL PRINCIP | Les 16 perdants des 1/16 de la principale → 1/8 … finale |
| 9 | 3- CONS | Rangs 33-48 → consolante qui démarre en 1/8 |
| 10 | 4- CHALENGE CONS | Les 8 perdants des 1/8 de la consolante → 1/4 … finale |
| 11 | CLASS FINAL | Classement 1-48 assemblé depuis les 4 tableaux |

### Tirage des poules (macro `TiragePoules`)

- Mélange aléatoire des équipes (Fisher-Yates), puis **méthode du cercle (round-robin)** sur 4 tours : personne ne joue deux fois le même adversaire, chaque équipe joue une fois par tour.
- Numéros de planche tirés au hasard à chaque tour (1 à n/2).
- Contrôle anti-doublon intégré. Nombre d'équipes pair obligatoire, 64 maximum.
- Pas de notion de niveau : c'est du pur hasard, pas un système suisse.
- Vérifié sur les données réelles : 96 matchs, aucun doublon, 48 équipes distinctes par tour.

### Phase finale : qui finit où

```
Classement poules 1-32 ─► PRINCIPALE (1/16)
                            ├─ perdants 1/16 ─► CHALLENGE PRINCIPALE (1/8)
                            │                     perdants 1/8 → 25-32, 1/4 → 21-24, 1/2 → 19-20, finale → 17-18
                            └─ perdants 1/8 → 9-16, 1/4 → 5-8, 1/2 → 3-4, finale → 1-2
Classement poules 33-48 ─► CONSOLANTE (1/8)
                            ├─ perdants 1/8 ─► CHALLENGE CONSOLANTE (1/4)
                            │                     perdants 1/4 → 45-48, 1/2 → 43-44, finale → 41-42
                            └─ perdants 1/4 → 37-40, 1/2 → 35-36, finale → 33-34
```

- Appariements du premier tour : une table figée de paires de rangs (ex. 9 vs 7, 31 vs 4, 26 vs 27…), écrite à la main en bas de feuille (`U62:V77`). Ce n'est **pas** un 1 vs 32 classique.
- Ensuite les gagnants avancent par formule `=SI(scoreA>scoreB; A; B)`.
- Planches attribuées en dur dans le tableau.
- Départage des perdants d'un même tour (ex. les 8 perdants des 1/8 qui se partagent 9 à 16) : boutons **MAJ PLACES x/y** qui trient par score du perdant. En cas d'égalité, c'est l'organisateur qui tranche « à la main » d'après le classement des poules (c'est écrit dans le mode d'emploi).
- Chaque tableau a une zone « CAPTURE » : vue compacte du tableau, faite pour une capture d'écran ou un affichage.

### Bugs et fragilités trouvés

1. **Les boutons « MAJ PLACES » ne marchent sur aucun autre PC.** Ils appellent des macros (`CLASS_PLACES_9_16`, etc.) rangées dans le `PERSONAL.XLSB` de l'auteur (`C:\Users\maxime.potereau\...`), qui n'est pas dans le fichier.
2. **CLASS FINAL affiche des `#N/A` à la place des noms** à partir de la 9e place : la plage de recherche glisse (`C14:$E$54`, `C15:$E$54`…) parce qu'il manque un `$`.
3. **Le bouton TIRAGE AU SORT efface tout** si on clique dessus pendant le tournoi (d'où l'avertissement « ne jamais cliquer en cours de partie »).
4. Le tri du classement des poules déplace des formules qui pointent vers d'autres lignes, donc la colonne « Matchs joués » ne correspond plus à l'équipe affichée.
5. `3- CONS` garde une colonne de `#REF!`, reste d'une ancienne version à plus d'équipes.
6. Le VBA contient beaucoup de code mort ou copié d'ailleurs : macros qui visent des onglets inexistants (`CLASSEMENT`, `Classement1`), un générateur d'arbre jamais appelé, une macro qui saisit des scores de test en dur.
7. Tout est prévu pour exactement 48 équipes : appariements, planches et plages sont figés.

---

## Fichier B : jusqu'à 96 équipes (pas utilisé)

### Déroulé

| Onglet | Rôle |
|---|---|
| inscriptions | N° 1-96, nom, colonne **Payé** (« ok » pour valider). Bouton effacer les noms |
| feuilles d'équipes | Seules les équipes « ok » (payées) gardent leur nom |
| tirage poule | 4 parties × 48 plaques. **Pas de tirage automatique** : on colle des tirages tout faits depuis un autre fichier (« Feuilles tirage de 52 à 96 équipes », « tirages championnats » sous 52) |
| Poule | Score saisi **par équipe** et par partie (pour/contre) : chaque match est donc saisi deux fois, une fois par équipe. Victoire = avoir marqué 13 |
| Classement poule | Boutons de tri : victoires ↓, pour ↓, différence ↓, contre ↑. Boutons de couleur : bleu 1-32, jaune 33-64, vert 65-96 |
| tirage tableau | 3 tableaux de 32 : **Principale** (1-32), **Consolante A** (33-64), **Consolante B** (65-96), chacun avec son **challenge** pour les perdants des 1/16 |
| classement definitif | Saisie des scores de chaque tour, un bouton de tri par tour (1/16, 1/8, 1/4, 1/2, finale) |
| gagnant | Podiums de chaque tableau et de chaque challenge, avec un code de lot (`tr`, `2co`, `2tr`) |

### Mécanique de la phase finale

- 1/16 : appariement **1 vs 32, 2 vs 31…** dans chaque bloc de 32.
- Astuce centrale : la **position d'une ligne dans « classement definitif » vaut classement**. Après chaque tour on trie chaque bloc par score du tour (pour ↓, contre ↑), puis par les tours précédents. Les gagnants (13 points) remontent en haut du bloc, les perdants descendent.
- Les tours suivants sont re-tirés à partir de ces positions triées avec un schéma fixe (ex. 1/8 : pos 8 vs 3, 16 vs 12, 2 vs 14…). Demies : 1 vs 4, 2 vs 3.
- Départage des perdants d'un même tour : automatique, par le score encaissé dans ce tour puis dans les précédents.
- **La finale se joue en 15 points** (`=SI(L=15;…)`), les autres parties en 13.
- Pour un nombre d'équipes qui n'est pas pile 96 (exemple donné : 60), il faut tout bricoler à la main : vider des plaques, « repêcher 2 équipes » parmi les meilleurs perdants, retaper des numéros d'équipe au hasard. Les consignes sont écrites dans des cellules.

### Ce qu'il fait mieux que A

- Suivi du paiement à l'inscription.
- Jusqu'à 96 équipes, 3 tableaux au lieu de 2.
- Départage des perdants automatique (pas de macro externe).
- Lots par place (onglet gagnant).
- Macros simples : rien d'autre que des tris et des effacements.

### Ce qu'il fait moins bien

- Pas de tirage des poules intégré (dépend d'un fichier externe).
- Double saisie des scores en poule (source d'erreurs).
- Tout nombre d'équipes autre que 96 se gère à la main.
- Une dizaine de clics sur des boutons de tri, dans le bon ordre, sinon le classement est faux.

---

## Ce que le site devra faire (constats, pas encore des décisions)

1. Inscriptions et paiement.
2. Tirage des 4 parties de poule sans revoir le même adversaire, avec attribution des planches, pour **n'importe quel nombre d'équipes**, y compris impair (exempt ?).
3. Saisie d'un score **une seule fois par match**.
4. Classement live : victoires, points pour, différence, puis contre.
5. Répartition en tableaux (2 de 32/16 ou 3 de 32) selon le nombre d'équipes, avec challenges.
6. Tableaux à élimination directe qui se remplissent tout seuls et gèrent les exempts quand le nombre n'est pas une puissance de 2.
7. Classement final complet 1 à N, avec départage automatique des perdants d'un même tour.
8. Impressions (feuilles de match par partie) et vue écran/projection du tableau.
9. Peut-être : lots par place, finale en 15 points.

## Réponses du club (2026-10-24)

- Format : **2 tableaux** (Principale et Consolante), chacun avec son challenge, comme le fichier A.
- **48 équipes, 24 planches.**
- Finale **en 13** (pas en 15).
- Gêne vécue : **impossible de renommer les équipes comme ils voulaient**. Plus largement, trop de manipulations manuelles dans le tableur, pas assez de souplesse.
- Contrainte côté nous : l'outil ne doit pas planter ni faire n'importe quoi le jour J. Fiabilité avant tout.

## Questions ouvertes pour le grilling

- Le format doit-il s'adapter si on n'a pas pile 48 équipes (40, 52, nombre impair) ?
- Pairs aléatoires au 1er tour (A) ou 1 vs 32 (B) ?
- Y a-t-il des lots par place ? Les codes `tr`, `2co`, `2tr` du fichier B n'ont pas été compris par le club, donc probablement à ignorer.
- Départage exact des perdants d'un même tour : score encaissé, puis classement des poules ?
- Que veulent dire les codes de lots `tr`, `2co`, `2tr` ?
- Qui saisit les scores : la table de marque seule, ou les joueurs sur leur téléphone (QR code sur la planche) ?
- Faut-il un affichage public (écran ou téléphone) du classement et des tableaux en direct ?
- Combien de planches physiques ? (A en utilise 24, B en utilise 48)
- Équipe absente ou forfait en cours de tournoi ?
