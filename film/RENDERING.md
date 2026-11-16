# Produire la vidéo localement

Guide pas à pas pour rendre le film (`film/`) sur ta machine, de l'installation aux fichiers finaux.
Le script de référence est `tools/film.cjs`. Le contenu du film (plans, temps, titres) est décrit
dans `film/STORYBOARD.md`.

## 1. Dépendances

| Outil | Version | Vérifier | Installer |
|---|---|---|---|
| Node.js | ≥ 20.19 (Vite 8) | `node --version` | https://nodejs.org ou `brew install node` |
| ffmpeg, avec `libx264` et `libsvtav1` | ≥ 6 | `ffmpeg -hide_banner -encoders \| grep -E "libx264\|libsvtav1"` (2 lignes attendues) | macOS : `brew install ffmpeg` · Ubuntu 24.04 : `sudo apt install ffmpeg` · Windows : utiliser WSL (Ubuntu) |
| Playwright + Chromium | récent | `npx playwright --version` | voir l'étape 2 (non déclaré dans `package.json`) |

Il faut aussi environ 1 Go de disque libre (le master pèse environ 50 Mo, mais les segments
intermédiaires et les sorties s'ajoutent).

## 2. Récupérer le code et installer

```bash
git clone https://github.com/aboucaud/rubinobs-animations.git
cd rubinobs-animations
git checkout claude/dreamy-maxwell-7fu0it      # la branche de la PR 13 (inutile une fois fusionnée dans main)
npm install
npm install --no-save playwright               # pilote le navigateur qui rend les images
npx playwright install chromium                # télécharge le Chromium de Playwright
```

Si Playwright ne peut pas télécharger son Chromium (réseau d'entreprise, par exemple), tu peux
utiliser Chrome déjà installé. Préfixe alors chaque commande `node tools/film.cjs …` par
`CHROME="/chemin/vers/chrome"`. Exemple sur macOS :
`CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.

## 3. Construire et servir le site (terminal 1)

```bash
npm run build      # vérification TypeScript + build dans dist/
npm run preview    # sert dist/ sur http://localhost:4173 ; laisser tourner
```

Pour vérifier, ouvre http://localhost:4173/film/3d/ dans un navigateur : le film se joue en boucle, calculé en direct.
(`film/` est la page publique, qui joue la vidéo déjà rendue.)
Le script attend ce serveur sur le port **4173** exactement : ferme tout autre `preview` déjà lancé.

## 4. Rendre (terminal 2)

Toutes les commandes se lancent à la racine du dépôt. Les fichiers produits vont dans `shots/`,
qui n'est pas suivi par git.

```bash
# a) brouillon rapide avec titres, pour vérifier que tout marche (quelques minutes)
node tools/film.cjs draft 640x360 15                 # → shots/film-draft.mp4
node tools/film.cjs draft 640x360 15 shots/p6.mp4 34-44   # seulement de 34 à 44 s

# b) le master : 1080p, 30 i/s, sans texte (le rendu long)
node tools/film.cjs master 1920x1080 30              # → shots/film-master.mp4

# c) les titres, chacun en PNG transparent, et le carton final (une minute)
node tools/film.cjs titles 1920x1080                 # → shots/film-titles/

# d) l'assemblage master + titres + carton final (environ 5 min)
node tools/film.cjs compose                          # → shots/film.webm (AV1) + shots/film.mp4 (H.264)

# e) l'extrait en boucle de la page d'accueil, découpé dans le master (une minute)
node tools/film.cjs loop                             # 31,5 → 42 s → shots/film-loop.webm / .mp4 / .jpg
```

**Durée du master.** Elle était d'environ 1 h 45 dans le conteneur cloud, avec le rendu WebGL
logiciel (SwiftShader). Le script utilise ce mode par défaut : il donne le même résultat partout,
mais il est lent.

**Essayer la carte graphique.** Préfixe la commande par `FILM_GL=gpu`. C'est souvent beaucoup plus
rapide, mais Chromium sans fenêtre n'a pas accès au GPU sur toutes les machines. Commence par un
`draft` court pour comparer le temps et l'image.

```bash
FILM_GL=gpu node tools/film.cjs draft 640x360 15 shots/gpu-test.mp4 0-4
FILM_GL=gpu node tools/film.cjs master 1920x1080 30
```

**Reprise.** Le master est rendu par segments de 4 s dans `shots/film-master/`. Si le rendu est
interrompu, relance la même commande : seuls les segments manquants sont rendus. Après une
modification de la scène, efface ce dossier (`rm -rf shots/film-master`), sinon les anciens
segments sont réutilisés.

## 5. Ce qu'il faut relancer après une modification

| Modification | À relancer |
|---|---|
| Texte, timing ou langue des titres (`CAPTIONS` dans `src/apps/film.ts`) | `npm run build`, `titles`, `compose` (quelques minutes) |
| Style des titres ou du carton final (`film/index.html`, `END_CARD` dans `film.ts`) | idem |
| Passage de l'extrait en boucle | `loop 30-40` (début-fin en secondes), sans rien d'autre |
| Scène, caméra, temps, modèles 3D | `npm run build`, `rm -rf shots/film-master`, `master`, puis `compose` |
| Qualité ou poids des fichiers finaux | `compose` seulement : ajuster `-crf` dans `compose()` de `tools/film.cjs` (AV1 : 35 ; MP4 : 20 ; plus haut = plus léger) |

## 6. Vérifier les glitches (facultatif)

Ces deux outils tournent contre le serveur de développement (`npm run dev`, port 5173) et non
contre `preview` :

```bash
node tools/zfight-image.cjs 1280x720 6 12 18 28   # pixels qui scintillent, en magenta → shots/zfight/
node tools/zfight.cjs 6 20                        # faces coplanaires, pièces qui dépassent du corps
```

## 7. Problèmes courants

- **`Cannot find module 'playwright'`** : refais l'étape 2 (`npm install --no-save playwright`).
  Un `npm install` ultérieur peut le retirer ; il suffit alors de le réinstaller.
- **Page jamais prête (délai dépassé)** : le serveur `npm run preview` ne tourne pas, ou pas sur le
  port 4173.
- **`Unknown encoder 'libsvtav1'`** : ta version de ffmpeg n'a pas l'encodeur AV1 ; installe une
  version complète (Homebrew ou Ubuntu 24.04). Le MP4 seul peut se faire en commentant la ligne
  `libsvtav1` de `compose()`.
- **Image noire ou vide avec `FILM_GL=gpu`** : le GPU n'est pas utilisable en mode sans fenêtre.
  Relance sans `FILM_GL`.

## 8. Mettre la vidéo en ligne

Les vidéos ne sont pas dans le dépôt : elles sont hébergées ailleurs, et le site ne connaît que leurs
adresses, réunies dans `src/media.ts` (`VIDEO_BASE`). Après un nouveau rendu :
1. dépose `shots/film.webm`, `shots/film.mp4`, `shots/film-loop.webm` et `shots/film-loop.mp4` sur
   l'hébergement, sous les mêmes noms (ou change `VIDEO_BASE` si l'adresse change) ;
2. si la scène a changé, remplace aussi les images d'attente `src/media/film-poster.jpg` (image du
   master à 33 s) et `src/media/film-loop.jpg` (créée par `loop`), et la vignette `public/thumbs/film.jpg`.

L'hébergement doit servir les fichiers en HTTPS, avec le bon type (`video/webm`, `video/mp4`), les
requêtes « Range » et sans forcer le téléchargement. Pour vérifier une adresse :
`curl -sI -H "Range: bytes=0-1" <adresse>` doit répondre `206`, avec `Content-Type: video/...`.
