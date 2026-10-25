# 19: Caution des palets prêtés

**What to build:** Suivre, côté console, les jeux de palets prêtés contre une caution de 2 €, puis rendus en fin de journée (caution remboursée). Réponse de Jean à la question 10, grilling avec Jimmy le 25/10 (`docs/grilling.md`).

- Une caution par équipe, facultative : une équipe qui a ses palets ne prend rien.
- Onglet Pointage : une case « Palets prêtés (2 €) » sur chaque ligne, indépendante du pointage, qu'on coche ou décoche à tout moment.
- Rendu : un filtre « Palets à rendre » (équipes avec des palets non rendus), un bouton « Rendu » par ligne, annulable, et la recherche par nom habituelle.
- Compteur en haut de l'onglet : « N jeux prêtés, N rendus, N à rendre ».
- Console seulement : rien sur la télé, la page publique ni les téléphones.
- Palets jamais rendus : l'équipe reste « non rendu », pas d'autre état.
- Chaque prêt et chaque rendu passe dans le journal (avec le prénom) et dans l'export.
- Le montant affiché est un réglage de l'édition (2 € par défaut), comme le tarif.

**Blocked by:** 04

**Status:** resolved

- [x] Prêt, annulation du prêt, rendu et annulation du rendu sont des commandes du moteur, avec refus clairs (rendu sans prêt, etc.)
- [x] Le compteur et le filtre « Palets à rendre » sont justes
- [x] Rien n'apparaît dans les vues publiques
- [x] Journal et export à jour
- [x] Déployé et vérifié en prod
