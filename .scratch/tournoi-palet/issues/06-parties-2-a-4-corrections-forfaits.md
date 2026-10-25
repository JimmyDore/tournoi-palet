# 06: Parties 2 à 4, corrections, forfaits et journal

**What to build:** Une fois la partie précédente terminée, l'organisateur lance la suivante. Le tirage ne fait jamais rejouer deux équipes déjà opposées. Avec un nombre impair d'équipes, l'exempt change à chaque partie et reçoit le score d'exempt réglé. Une équipe déclarée forfait n'est plus tirée, et ses matchs restants sont gagnés 13-0 par l'adversaire. Corriger un score déjà saisi fait recalculer le classement tout seul. Retirer une partie déjà lancée demande une confirmation explicite. Un journal liste chaque modification : horodatage, action, valeurs avant et après.

**Blocked by:** 05

**Status:** resolved

- [x] 48 équipes sur 4 parties : aucun adversaire revu, une seule apparition par partie (test moteur)
- [x] Nombre impair : un exempt différent à chaque partie, avec le bon score
- [x] Forfait en poule : plus tiré, adversaires gagnants 13-0
- [x] Correction de score : classement recalculé, sans aucune action de mise à jour
- [x] Retrait d'une partie lancée uniquement après confirmation
- [x] Journal consultable dans la console
- [x] Déployé et vérifié en prod
