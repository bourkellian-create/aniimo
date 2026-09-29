# Aniimo Sync

Application PC (Windows, macOS, Linux) qui **synchronise automatiquement ta progression Aniimo** en lisant ce qui s'affiche à l'écran pendant que tu joues : captures d'Aniimo, variantes Illusory/Sparkling, progression de l'Aniilog, UID et niveau d'affinité de tes amis.

> Projet de fan, non officiel, sans lien avec Pawprint Studio ni l'éditeur d'Aniimo.

## Comment ça synchronise, sans risque pour ton compte

Aniimo n'a **pas d'API officielle**, et ses conditions d'utilisation interdisent la rétro-ingénierie, le sondage des serveurs et l'extraction de données. Aniimo Sync ne fait donc **rien de tout ça** :

| ✅ Ce que fait l'app | ❌ Ce qu'elle ne fait jamais |
|---|---|
| Regarde l'image de la fenêtre du jeu, comme un logiciel de stream | Lire ou modifier la mémoire du jeu |
| Lit les captures d'écran que tu prends (dossier surveillé) | Intercepter le trafic réseau |
| Reconnaît le texte à l'écran, **hors ligne**, sur ton PC (OCR Tesseract) | Appeler les serveurs d'Aniimo |
| Garde tes données dans un fichier local | Envoyer quoi que ce soit sur Internet |

## Sources de synchronisation

1. **Lecture de la fenêtre du jeu** (activée par défaut) : toutes les 4 secondes, l'app prend une image de la fenêtre dont le titre contient « Aniimo ». Elle ne relance la lecture que si l'écran a changé. Le jeu doit être en mode **fenêtré** ou **plein écran fenêtré** : en plein écran exclusif, l'image capturée est noire.
2. **Dossiers de captures d'écran** : chaque nouvelle image déposée dans un dossier surveillé (Impr. écran, Steam, outil Capture…) est lue automatiquement. Par défaut, l'app surveille `Images/Screenshots`.
3. **Import manuel** d'anciennes captures, depuis les Réglages.

## Ce qui est reconnu

| Écran du jeu | Ce que l'app enregistre |
|---|---|
| Capture réussie / New Aniimo Caught | Aniimo ajouté à ta collection (+ Illusory / Sparkling) |
| Aniilog | « Vu dans l'Aniilog » + progression `57/210` |
| Profil (Pathfinder) | Ton UID + progression de l'Aniilog |
| Affinité d'un ami | Niveau d'affinité (Good Friend, Illusory Friend…) par UID |

Quand une lecture est douteuse (nom mal reconnu, deux noms possibles, affinité sans UID lisible), l'app **ne devine pas** : elle place la lecture dans l'onglet **À confirmer**, où un clic suffit.

## Installation (développement)

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install
npm start       # lance l'application
npm test        # tests (analyse d'écran, synchronisation, OCR sur des captures de test)
```

## Calibrer avec de vraies captures du jeu

Les mots-clés qui identifient chaque écran sont dans [`data/screen-rules.json`](data/screen-rules.json). La liste de noms de départ, volontairement courte, est dans [`data/aniimo-names.json`](data/aniimo-names.json). Tu peux compléter les noms depuis l'app (Réglages > Noms d'Aniimo reconnus).

Pour voir ce que l'app comprend d'une capture :

```bash
npm run ocr -- "C:\Users\moi\Pictures\Screenshots\capture.png"
```

La commande affiche le texte lu, l'écran détecté et ce qui serait synchronisé. Si un écran est mal reconnu, ajoute le mot-clé manquant dans `screen-rules.json`, et dépose la capture dans `test/fixtures/` pour en faire un test.

## Structure

```
src/core/      logique testable sans Electron
  ocr.js         OCR hors ligne (tesseract.js, anglais + français)
  parser.js      texte lu → type d'écran, noms, UID, progression, affinité
  names.js       reconnaissance tolérante des noms d'Aniimo
  sync.js        lecture → collection / amis / confirmations
  image.js       empreinte d'écran (dHash) et préparation de l'image
  store.js       sauvegarde locale JSON
src/main/      processus Electron : capture de la fenêtre, dossiers surveillés, IPC
src/renderer/  interface
data/          noms et règles de détection (modifiables)
```

## Limites actuelles

- Les règles de détection ont été écrites **sans vraies captures du jeu** et testées sur des images synthétiques. Il faut les ajuster avec de vraies captures (voir « Calibrer »).
- La liste de noms de départ est incomplète.
- Pas encore d'installeur (`.exe`) : l'app se lance avec `npm start`.
