# Storyboard — « Du filtre aux étoiles »

Document de travail : c'est la référence du film. On le corrige ici d'abord ; le code
(`src/apps/film.ts`) est ensuite mis à jour pour le suivre, puis on fait le rendu.

**Comment l'annoter** : modifie directement le texte, ou ajoute des lignes `> À CHANGER : …`
sous le plan concerné. Les temps sont en secondes de film.

État : **version 2 du storyboard**, avec tes corrections. Elle n'est pas encore codée : le dernier
rendu (brouillon 3) correspond à la version 1.

### Changements depuis la version 1

- Formats : ajout d'une version web compressée (AV1).
- Textes : en haut au centre, un titre seul (plus de ligne de sous-titre).
- Filtres : l'échange se fait de g vers r ; la lumière de la fin est dans la bande r.
- Plan 1 : vue de face du filtre (l'angle par défaut de la page « filter exchange »), plus de profil.
- Plans 5 à 7 refaits : on voit la lumière se réfléchir sur M1, M2 puis M3 en vue large ; la
  plongée ne commence qu'une fois la lumière repartie de M3. Elle se fait en suivant les rayons
  vers la caméra, pendant qu'ils ralentissent fortement, jusqu'à leur arrivée sur le plan focal.
  Le film passe de 42 à 44 s.

---

## Réglages généraux

| Réglage | Valeur |
|---|---|
| Durée totale | 44 s |
| Prise de vue | un seul plan-séquence, sans coupe, 1920×1080, 30 images/s (brouillons : 640×360, 15 images/s) |
| Version web | **WebM AV1** : la plus légère pour un affichage rapide (estimation : 3 – 6 Mo pour 44 s en 1080p), lue par Chrome, Firefox, Edge et les Safari récents |
| Version de secours | MP4 H.264 : lue partout (plus lourde, ~10 – 20 Mo), proposée par la page web aux navigateurs sans AV1 |
| Fond, plans 1 à 3 | studio gris neutre, dégradé (gris moyen en haut, gris foncé en bas) |
| Fond, plans 4 à 7 | ciel de nuit étoilé (fondu depuis le gris entre 21 et 24,5 s) |
| Textes à l'écran | en anglais, **en haut au centre, un titre seul** |
| Son | aucun |
| Filtre au départ / à l'arrivée | **g → r** (la lumière de la fin est dans la bande r, en rouge orangé) |

Note sur le WebP animé : pour 44 s en 1080p, il pèserait bien plus qu'une vidéo (plusieurs dizaines
de Mo). Je ne le propose donc que pour un extrait court, si besoin (voir D7).

---

## Plan 1 — Le changeur de filtre (0 → 9 s)

**On voit** : le changeur de filtre seul (carrousel, autochanger, 6 filtres, moteur), sans
cryostat ni corps de caméra, sans coupe. Il est couché, l'emplacement d'attente du filtre en haut.

**Action** : séquence réelle d'échange g → r, accélérée ×10 (82 s réelles en 8,2 s) :

| Film | Étape (durée réelle) |
|---|---|
| 0,8 – 1,1 s | Vérifications (3 s) |
| 1,1 – 1,6 s | Desserrage du filtre g (5 s) |
| 1,6 – 3,0 s | Retour de g dans son logement (14 s) |
| 3,0 – 3,6 s | Verrouillage dans le carrousel (6 s) |
| 3,6 – 6,2 s | Le carrousel tourne de 1/5 de tour (26 s) |
| 6,2 – 6,8 s | L'autochanger saisit r (6 s) |
| 6,8 – 8,2 s | r est amené dans le faisceau (14 s) |
| 8,2 – 9,0 s | Serrage en position (8 s) |

**Caméra** : **vue de face, depuis l'avant (côté des lentilles), en léger trois-quarts et un
peu au-dessus** : l'angle par défaut de la page « filter exchange ». On voit le filtre de face,
et donc sa couleur, pendant qu'il entre et sort du faisceau. Plan presque fixe, très léger
rapprochement.

**Titre (0 – 9,2 s)** : *The filter changer swaps the g filter for r (10× faster than reality)*

---

## Plan 2 — La caméra se construit autour (9,2 → 18 s)

**Transition** : de 9 à 10,5 s, la caméra tourne autour du changeur pour passer de la vue de
face à la vue de côté (axe optique dans la largeur de l'image), afin que les pièces arrivent
par les côtés et utilisent toute la largeur.

**Action** : les pièces glissent le long de l'axe jusqu'à leur place, de l'intérieur vers
l'extérieur :

| Film | Pièce | Arrive par |
|---|---|---|
| 9,4 – 11,0 s | Cryostat et plan focal | la gauche (arrière), 1,3 m |
| 10,4 – 12,0 s | Obturateur | la droite (avant), 0,9 m |
| 11,4 – 13,2 s | Lentilles L1 et L2 | la droite, 1,4 m |
| 12,8 – 14,8 s | Corps de la caméra | la gauche, 2,2 m |
| 14,4 – 16,2 s | Tronc (électronique, froid, vide) | la gauche, 1,8 m |
| 15,6 – 17,4 s | Hexapode et rotateur | la gauche, 1,8 m |

**Caméra** : recule progressivement (jusqu'à ~6,5 m) pour garder dans le cadre les pièces qui
arrivent : d'abord centrée sur l'avant (obturateur, lentilles), puis sur l'arrière (corps,
tronc, hexapode), puis sur la caméra complète à 17,6 s.

**Titre (9,2 – 20 s)** : *The camera is built around it*

---

## Plan 3 — La caméra se redresse (18,2 → 20,3 s)

**Action** : la caméra assemblée pivote de 90° autour de son centre et se met à la verticale
(L1 en bas), dans la position qu'elle a dans le télescope.

**Caméra** : glisse vers une vue de trois-quarts avant, à ~6 m.

**Titre** : celui du plan 2 jusqu'à 20 s, puis celui du plan 4.

---

## Plan 4 — Entrée dans le télescope (20,6 → 27,5 s)

**Action** : la caméra descend de 18 m, le long de l'axe optique, jusqu'à sa place au cœur du
télescope (pointé au zénith). Le fond gris s'efface vers le ciel de nuit entre 21 et 24,5 s ;
le télescope apparaît en dessous.

**Caméra** : suit la descente depuis l'avant du télescope (anneaux d'élévation vus par la
tranche), puis s'élève et recule vers une vue d'ensemble de trois-quarts avant (à ~27 m) à 27,5 s.

**Titre (20 – 28 s)** : *LSSTCam takes its place in the Simonyi telescope*

**Défaut connu** : pendant la descente, la caméra traverse le tube opaque central du haut du
télescope et disparaît ~1,5 s (vers 24 – 26 s). → voir décision D1.

---

## Plan 5 — La lumière d'une étoile, de M1 à M3 (27,5 → 34,5 s)

**Action** :
- 28,5 s : le télescope passe en vue en coupe (la moitié face à nous est retirée) ;
- 28,5 – 29,3 s : l'obturateur de la caméra s'ouvre ;
- 28,5 – 29,5 s : une étoile apparaît au-dessus du télescope, au centre du champ ;
- 29,5 s : un front d'onde part de l'étoile (faisceau 3D, bande r, rouge orangé) ;
- ~31 s : il se réfléchit sur **M1** (le grand miroir, en bas) et remonte ;
- ~32,5 s : il se réfléchit sur **M2** (en haut) et redescend ;
- ~34 s : il se réfléchit sur **M3** (au centre de M1) et remonte vers la caméra.

**Caméra** : vue large de face du télescope en coupe (à ~21 m, à hauteur du tube), **fixe
pendant tout le trajet M1 → M2 → M3**, pour que les trois réflexions se lisent bien.

**Titre (28 – 34,5 s)** : *Starlight bounces off three mirrors: M1, M2, M3*

---

## Plan 6 — On suit la lumière vers la caméra (34,5 → 38,5 s)

**Action** : juste après la réflexion sur M3, la lumière remonte vers la caméra et **ralentit
fortement** (de ~6 m/s à ~0,25 m/s entre 34,5 et 36 s), le temps de la suivre.

**Caméra** : la plongée commence ici. La caméra entre dans le tube ouvert par la coupe, rejoint
l'axe juste au-dessus de M3, puis **remonte le long du faisceau en suivant les rayons**, jusque
sous L1. (Ce trajet passe sous la structure du haut du télescope : il règle le défaut D2 de la
version 1.)

**Titre (34,5 – 44 s)** : *…then three lenses and a filter, down to the 3.2-gigapixel focal plane*

---

## Plan 7 — Arrivée sur le plan focal (38,5 → 44 s)

**Action** (la lumière avance lentement, ~0,25 m/s) :
- ~38,5 s : elle traverse L1 ;
- ~39,5 s : L2 ;
- ~41 s : le filtre r ;
- ~41,5 s : L3 ;
- ~42 s : elle touche le plan focal (189 capteurs) ; un point lumineux s'allume ;
- 42 – 44 s : le faisceau continue de pulser ; plan fixe sur le point lumineux.

**Caméra** : rapproche jusqu'au plan focal (vue en contre-plongée, comme la vue « Focal plane »
de la page télescope), puis plan quasi fixe jusqu'à la fin.

**Titre** : celui du plan 6, jusqu'à la fin.

---

## Décisions ouvertes

- **D1 — Insertion de la caméra** : (a) rendre transparent ou couper le tube central pendant la
  descente ; (b) garder tel quel ; (c) reproduire la vraie procédure d'installation (laquelle ?).
- **D2 — Lentilles et filtre au plan 7** : dans la version 1, ils étaient masqués à la fin pour bien
  voir les capteurs. Maintenant que la lumière les traverse lentement à l'écran, je propose de les
  **garder visibles** pendant que la lumière passe, puis de les estomper juste avant qu'elle touche
  le plan focal (~41,5 s). Autre option : les garder jusqu'au bout.
- **D3 — Fluidité** : lisser le mouvement de caméra (supprimer les à-coups aux changements de
  direction). Je le ferai dans tous les cas, sauf avis contraire.
- **D4 — Titres** : textes ci-dessus à valider. Une version française en plus ?
- **D5 — Début et fin** : carton titre au début ? carton final (crédits, sources, lien vers le
  site) ? Pas de logo officiel Rubin sans autorisation.
- **D6 — Durée** : 44 s convient-il ? Quels passages allonger ou raccourcir ?
- **D7 — Extrait court** : en plus de la vidéo complète, un extrait de 6 – 8 s en boucle (WebP animé
  ou vidéo AV1 en boucle) pour les réseaux ou la page d'accueil ? Quel passage ?
