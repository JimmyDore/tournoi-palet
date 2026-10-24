# 11: Tableaux : répartition et premier tour

**What to build:** À la fin des poules, le site propose une répartition Principal / Consolante (2/3 et 1/3 par défaut), que l'organisateur ajuste puis valide. Le site génère alors les deux tableaux. Leur taille est portée à la puissance de 2 supérieure, les exempts vont aux mieux classés, et le premier tour suit la méthode réglée dans l'édition (têtes de série par défaut, tirage au sort en option). Les matchs du premier tour reçoivent une planche et apparaissent dans la console et sur la télé.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Répartition proposée, ajustable, validée explicitement
- [ ] 48 équipes : Principal de 32 et Consolante de 16, sans exempt
- [ ] 40 et 52 équipes : exempts attribués aux mieux classés de chaque tableau (tests moteur)
- [ ] Méthode du premier tour réglable : têtes de série (1 et 2 ne peuvent se croiser qu'en finale) ou tirage au sort
- [ ] Saisie d'un score de premier tour avec les mêmes règles qu'en poule
- [ ] Déployé et vérifié en prod
