# Storyboard — « Du filtre aux étoiles »

Document de travail : c'est la référence du film. On le corrige ici d'abord ; le code
(`src/apps/film.ts`) est ensuite mis à jour pour le suivre, puis on fait le rendu.

**Comment l'annoter** : modifie directement le texte, ou ajoute des lignes `> À CHANGER : …`
sous le plan concerné. Les temps sont en secondes de film.

État : **version 4 du storyboard** = version 3, avec tes corrections du brouillon 4. Télescope :
forme de la PR #12 (anneaux d'élévation en demi-anneaux). Brouillon correspondant : brouillon 5.

### Changements depuis la version 3

- Plan 5 : **plus de vue en coupe du télescope**. Une fois la caméra installée, on voit le télescope
  entier ; **dès que la lumière part de l'étoile (29,5 s), toute la structure s'efface en fondu**
  (tube, anneaux, piliers, araignée, monture, pilier et sol), pour ne garder que les miroirs (et la
  caméra). C'est l'effet principal du plan.
- Plan 6 : la **coupe de la caméra** n'arrive qu'au moment du zoom sur la caméra, une fois la lumière
  repartie de M3 (balayage de 35 à 36 s) ; avant, la caméra reste entière.
- Plan 5 : une fois la structure effacée, léger zoom avant sur les miroirs (31 → 34,3 s).
- Plans 6 et 7 : la coupe s'applique aussi aux lentilles L1 et L2 (dans le brouillon 4, elles
  restaient entières et masquaient une partie de la vue).

### Changements depuis la version 2

- Plan 4 (D1 réglée) : la coupe du télescope s'ouvre progressivement pendant la descente (balayage
  de ~1,2 s), pour voir la caméra traverser le haut du télescope au lieu de la perdre dans le tube
  central ; elle se referme une fois la caméra en place.
- Plan 5 : vue large un peu plus reculée (~25 m au lieu de 21), pour que le titre soit sur le ciel
  noir et que M2 soit bien dégagé.
- Plan 6 : la structure du télescope s'efface en fondu au début de la plongée (remplacé en v4 :
  le fondu a lieu dès le départ de la lumière, au plan 5).
- Plan 7 (D2 réglée) : lentilles et filtre s'effacent en fondu (0,5 s) au lieu de disparaître d'un coup.
- Tout le film (D3 réglée) : mouvement de caméra lissé, sans à-coups aux points de passage.

### Changements depuis la version 1

- Formats : ajout d'une version web compressée (AV1).
- Textes : en haut au centre, un titre seul (plus de ligne de sous-titre).
- Filtres : l'échange se fait de g vers r ; la lumière de la fin est dans la bande r.
- Plan 1 : vue de face du filtre (l'angle par défaut de la page « filter exchange »), plus de profil.
- Plan 2 : on garde l'angle de face et on recule seulement pendant l'arrivée du cryostat (par
  l'arrière), de l'obturateur (perpendiculairement à l'axe, depuis la gauche, derrière le filtre r)
  et des lentilles (le long de l'axe, par l'avant) ;
  la rotation vers le profil ne commence qu'avec l'arrivée du corps, du tronc et de l'hexapode.
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

Deux temps : d'abord on garde l'angle de face du plan 1 et on recule seulement ; ensuite la vue
tourne vers le profil pendant que les grosses pièces de l'arrière arrivent.

### 2a — Même angle, zoom arrière (9,2 → 13,2 s)

**Caméra** : **aucun changement d'angle**. On garde exactement la vue de face du plan 1 et on
recule simplement le long de la même ligne de visée (zoom arrière d'environ 3 m à 5 m), pour
voir les pièces se mettre en place autour du changeur.

**Action** :

| Film | Pièce | Comment elle arrive |
|---|---|---|
| 9,4 – 11,0 s | Cryostat et plan focal | **par l'arrière**, le long de l'axe : il sort de derrière le changeur et s'insère en son centre |
| 10,4 – 12,0 s | Obturateur | **perpendiculairement à l'axe optique**, depuis la gauche de l'image, et vient se placer **derrière le filtre r** |
| 11,4 – 13,2 s | Lentilles L1 et L2 (avec leur support) | **le long de l'axe optique**, par l'avant (depuis notre côté, vers le fond de l'image), et se placent devant le changeur |

Comme toutes les pièces de la caméra (cryostat, lentilles, corps, tronc, hexapode), les lentilles
arrivent le long de l'axe optique ; seul l'obturateur arrive perpendiculairement à l'axe.

### 2b — Rotation vers le profil (13,2 → 18 s)

**Caméra** : la vue tourne autour de la caméra, de la vue de face vers la vue de profil (axe
optique dans la largeur de l'image, lentilles à droite), de 13,2 à 15 s, en reculant encore un
peu pour garder toute la caméra dans le cadre (~6,5 m). Puis plan stable sur la caméra complète
à 17,6 s.

**Action** : les pièces de l'arrière arrivent le long de l'axe, donc par la gauche de l'image
une fois de profil :

| Film | Pièce | Arrive par |
|---|---|---|
| 13,6 – 15,4 s | Corps de la caméra | l'arrière (la gauche), 2,2 m |
| 15,0 – 16,6 s | Tronc (électronique, froid, vide) | l'arrière, 1,8 m |
| 16,0 – 17,6 s | Hexapode et rotateur | l'arrière, 1,8 m |

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

**Coupe pendant la descente** : de 22,8 à 24 s, la moitié du télescope tournée vers nous s'efface
par un balayage, pour qu'on voie la caméra traverser le haut du télescope et se mettre en place ;
de 26 à 27,3 s, le télescope se referme.

---

## Plan 5 — La lumière d'une étoile, de M1 à M3 (27,5 → 34,5 s)

**Action** :
- le télescope est entier (pas de coupe), la caméra aussi ;
- 28,5 – 29,3 s : l'obturateur de la caméra s'ouvre ;
- 28,5 – 29,5 s : une étoile apparaît au-dessus du télescope, au centre du champ ;
- 29,5 s : un front d'onde part de l'étoile (faisceau 3D, bande r, rouge orangé) ;
- **29,5 – 31,0 s : toute la structure s'efface en fondu** (tube, anneaux, piliers, araignée,
  monture, pilier et sol) : il ne reste que les miroirs M1, M2, M3 et la caméra ;
- 31,7 s : il se réfléchit sur **M1** (le grand miroir, en bas) et remonte ;
- 32,8 s : il se réfléchit sur **M2** (en haut) et redescend ;
- 33,9 s : il se réfléchit sur **M3** (au centre de M1) et remonte vers la caméra.

**Caméra** : vue large de face du télescope (à ~25 m, à hauteur du tube), fixe jusqu'à la fin du
fondu (31 s). Puis **léger zoom avant sur les miroirs** (de ~25 m à ~15 m, 31 → 34,3 s), en
gardant M1 et M2 entiers dans le champ, sous le titre.

**Titre (28 – 34,5 s)** : *Starlight bounces off three mirrors: M1, M2, M3*

---

## Plan 6 — On suit la lumière vers la caméra (34,5 → 38,5 s)

**Action** : la lumière va à vitesse constante (5,7 m/s) jusqu'à M3 ; juste après la réflexion,
elle **freine fortement** (de 5,7 à ~0,3 m/s entre 34,0 et 34,6 s), le temps de la suivre.

**Caméra** : la plongée commence ici. La vue s'approche des miroirs (la structure a disparu au
plan 5), rejoint l'axe juste au-dessus de M3, puis **remonte le long du faisceau en suivant les
rayons**, jusque sous L1.

**Coupe de la caméra** : de 35 à 36 s, la moitié de la caméra tournée vers nous s'efface par un
balayage (corps, lentilles L1 et L2, filtre, cryostat), pour voir la lumière à l'intérieur.

**Titre (34,5 – 44 s)** : *…then three lenses and a filter, down to the 3.2-gigapixel focal plane*

---

## Plan 7 — Arrivée sur le plan focal (38,5 → 44 s)

**Action** (la lumière avance lentement, ~0,25 m/s) :
- 38,5 s : elle traverse L1 ;
- 40,2 s : L2 ;
- 41,5 s : le filtre r ;
- 41,7 s : L3 ;
- 41,5 – 42 s : lentilles et filtre s'effacent en fondu ;
- 42,0 s : elle touche le plan focal (189 capteurs) ; un point lumineux s'allume ;
- 42 – 44 s : le faisceau continue de pulser ; plan fixe sur le point lumineux.

**Caméra** : rapproche jusqu'au plan focal (vue en contre-plongée, comme la vue « Focal plane »
de la page télescope), puis plan quasi fixe jusqu'à la fin.

**Titre** : celui du plan 6, jusqu'à la fin.

---

## Décisions

- **D1 — Insertion de la caméra** : réglée en v3 (coupe en balayage pendant la descente).
  La vraie procédure d'installation reste à reproduire si tu le souhaites.
- **D2 — Lentilles et filtre au plan 7** : réglée en v3 (visibles pendant la traversée, puis fondu).
- **D3 — Fluidité** : réglée en v3 (trajectoire lissée).
- **D4 — Titres** : réglée. Anglais seulement pour l'instant (traduction plus tard, avec le site).
  Textes validés (`CAPTIONS` dans `film.ts`), police un peu plus grande (3,1 % de la hauteur) :
  1. The LSSTCam filter changer swaps the g filter for r (10× faster than reality)
  2. It sits inside the largest digital camera ever built for astronomy
  3. LSSTCam is installed on the Simonyi telescope with its 8.4 m main mirror
  4. Let’s follow light coming from a star, bouncing off the three mirrors
  5. …then through the lenses and filter, down to the 3.2-gigapixel focal plane
- **D5 — Début et fin** : réglée. Pas de carton au début. Carton final de 3 s (fondu enchaîné de
  0,5 s) : « Vera C. Rubin Observatory », une ligne de description et l'adresse du site
  (`END_CARD` dans `film.ts`), et en bas, en petit et en gris, « Animation: Alexandre Boucaud (CNRS, IN2P3) ». Logo Rubin seulement si la vidéo est approuvée. Film : 47 s au total.
- **D6 — Durée** : réglée, 44 s.
- **D7 — Extrait court** : réglée. 31,5 → 42 s (de M2/M3 jusqu'aux CCD, 10,5 s), sans titre, léger
  fondu au noir (0,3 s) au début et à la fin, 1280×720 (`node tools/film.cjs loop`).
- **D8 — Diffusion sur le site** : réglée, option (c). Un extrait court en boucle (voir D7) en tête
  de la page d'accueil, plus une carte vers la page `film/`. Celle-ci joue le film complet en vidéo
  (WebM AV1, MP4 en secours, image d'attente), avec un lien vers la version 3D en direct. Les
  fichiers vont dans `public/`, servis par GitHub Pages.
- **D8a — Place sur l'accueil** : réglée. Bandeau large sous le texte d'introduction, au-dessus des
  cartes ; carte « The film » en première position.
- **D8b — Comportement** : réglée. Lecture automatique, sans son, en boucle ; image fixe seule si
  `prefers-reduced-motion`.
- **D8c — Intégration** : réglée. PR séparée, après la fusion de la PR 13.
