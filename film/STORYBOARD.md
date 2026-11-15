# Storyboard — « Du filtre aux étoiles »

Document de travail : c'est la référence du film. On le corrige ici d'abord ; le code
(`src/apps/film.ts`) est ensuite mis à jour pour le suivre, puis on fait le rendu.

**Comment l'annoter** : modifie directement le texte, ou ajoute des lignes `> À CHANGER : …`
sous le plan concerné. Les temps sont en secondes de film.

État décrit : brouillon 3, version horizontale (la version verticale est abandonnée).

---

## Réglages généraux

| Réglage | Valeur actuelle |
|---|---|
| Durée totale | 42 s |
| Format du rendu final | MP4 (H.264), 1920×1080, 30 images/s (brouillons : 640×360, 15 images/s) |
| Prise de vue | un seul plan-séquence, sans coupe |
| Fond, plans 1 à 3 | studio gris neutre, dégradé (gris moyen en haut, gris foncé en bas) |
| Fond, plans 4 à 7 | ciel de nuit étoilé (fondu depuis le gris entre 21 et 24,5 s) |
| Textes à l'écran | en anglais, en bas au centre : un titre et une ligne de sous-titre |
| Son | aucun |
| Filtre au départ / à l'arrivée | r → g (la lumière de la fin est donc dans la bande g, en bleu) |

---

## Plan 1 — Le changeur de filtre (0 → 9 s)

**On voit** : le changeur de filtre seul (carrousel, autochanger, 6 filtres, moteur), sans
cryostat ni corps de caméra, sans coupe. Il est couché à l'horizontale : axe optique dans la
largeur de l'image, lentille L1 côté droit, emplacement d'attente du filtre en haut.

**Action** : séquence réelle d'échange r → g, accélérée ×10 (82 s réelles en 8,2 s) :

| Film | Étape (durée réelle) |
|---|---|
| 0,8 – 1,1 s | Vérifications (3 s) |
| 1,1 – 1,6 s | Desserrage du filtre r (5 s) |
| 1,6 – 3,0 s | Retour de r dans son logement (14 s) |
| 3,0 – 3,6 s | Verrouillage dans le carrousel (6 s) |
| 3,6 – 6,2 s | Le carrousel tourne de 1/5 de tour (26 s) |
| 6,2 – 6,8 s | L'autochanger saisit g (6 s) |
| 6,8 – 8,2 s | g est amené dans le faisceau (14 s) |
| 8,2 – 9,0 s | Serrage en position (8 s) |

**Caméra** : vue de côté, légèrement au-dessus, à ~3 m ; lent travelling tournant d'environ 15°.

**Texte (0 – 9,2 s)** :
- *The filter changer of LSSTCam swaps the r filter for g*
- *built by IN2P3/CNRS · 82 s in reality, shown 10× faster*

---

## Plan 2 — La caméra se construit autour (9,2 → 18 s)

**Action** : les pièces glissent le long de l'axe (donc horizontalement) jusqu'à leur place,
de l'intérieur vers l'extérieur. Chacune apparaît hors de sa place puis vient s'emboîter :

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

**Texte (9,2 – 20 s)** :
- *The camera is built around it*
- *cryostat and focal plane · shutter · lenses L1 and L2 · body · electronics and hexapod*

---

## Plan 3 — La caméra se redresse (18,2 → 20,3 s)

**Action** : la caméra assemblée pivote de 90° autour de son centre et se met à la verticale
(L1 en bas), dans la position qu'elle a dans le télescope.

**Caméra** : glisse vers une vue de trois-quarts avant, à ~6 m.

**Texte** : celui du plan 2 jusqu'à 20 s, puis celui du plan 4.

---

## Plan 4 — Entrée dans le télescope (20,6 → 27,5 s)

**Action** : la caméra descend de 18 m, le long de l'axe optique, jusqu'à sa place au cœur du
télescope (pointé au zénith). Le fond gris s'efface vers le ciel de nuit entre 21 et 24,5 s ;
le télescope apparaît en dessous.

**Caméra** : suit la descente depuis l'avant du télescope (anneaux d'élévation vus par la
tranche), puis s'élève et recule vers une vue d'ensemble de trois-quarts avant (à ~27 m) à 27,5 s.

**Texte (20 – 28 s)** :
- *LSSTCam takes its place at the heart of the Simonyi telescope*
- *3.2 gigapixels · 1.65 m wide · 3 tonnes · schematic installation*

**Défaut connu** : pendant la descente, la caméra traverse le tube opaque central du haut du
télescope et disparaît ~1,5 s (vers 24 – 26 s). → voir décision D1.

---

## Plan 5 — La lumière d'une étoile (27,5 → 31,5 s)

**Action** :
- 28,5 s : le télescope passe en vue en coupe (la moitié face à nous est retirée) ;
- 28,5 – 29,3 s : l'obturateur de la caméra s'ouvre ;
- 28,5 – 29,5 s : une étoile apparaît au-dessus du télescope, au centre du champ ;
- 29,5 s : un front d'onde part de l'étoile (faisceau 3D, bande g, en bleu) : M1 → M2 → M3,
  puis remonte vers la caméra. La lumière va vite dans cette partie.

**Caméra** : descend vers une vue de face du télescope en coupe (à ~21 m, à hauteur du tube).

**Texte (28 – 42 s)** :
- *Starlight: three mirrors, three lenses, one filter*
- *M1 → M2 → M3 → L1 · L2 · filter g · L3 → focal plane*

---

## Plan 6 — Plongée vers la caméra (31,5 → 35,5 s)

**Action** : la lumière termine son trajet dans le télescope.

**Caméra** : avance vers la caméra jusqu'à une vue de l'intérieur, sous L1.

**Défaut connu** : la vue traverse la structure du haut du télescope vers 33 – 34 s. → décision D2.

---

## Plan 7 — Arrivée sur le plan focal (35,5 → 42 s)

**Action** :
- 35 – 36,5 s : la lumière ralentit fortement (≈ 0,3 m/s) ;
- 37,2 s : lentilles et filtre masqués, pour bien voir les capteurs ;
- ~39 s : la lumière entre dans le cadre, par L1 ;
- ~40 s : elle touche le plan focal (189 capteurs) ; un point lumineux s'allume ;
- 40 – 42 s : le faisceau continue de pulser ; plan fixe sur le point lumineux.

**Caméra** : rapproche jusqu'au plan focal (vue en contre-plongée, comme la vue
« Focal plane » de la page télescope), puis plan quasi fixe jusqu'à la fin.

**Texte** : celui du plan 5, jusqu'à la fin.

---

## Décisions ouvertes

- **D1 — Insertion de la caméra** : (a) rendre transparent ou couper le tube central pendant la
  descente ; (b) garder tel quel ; (c) reproduire la vraie procédure d'installation (laquelle ?).
- **D2 — Plongée du plan 6** : passer sous la structure plutôt qu'à travers (trajectoire un peu
  plus longue), ou couper la structure à ce moment-là.
- **D3 — Fluidité** : lisser le mouvement de caméra (supprimer les à-coups aux changements de
  direction). Je le ferai dans tous les cas, sauf avis contraire.
- **D4 — Textes** : langue (anglais / français / les deux en deux versions) ; textes à revoir ?
- **D5 — Début et fin** : carton titre au début ? carton final (crédits, sources, lien vers le
  site) ? Pas de logo officiel Rubin sans autorisation.
- **D6 — Durée** : 42 s convient-il ? Quels passages allonger ou raccourcir ?
- **D7 — Livrables** : MP4 1080p seul, ou aussi un GIF / MP4 court (6 – 8 s, quel passage ?).
