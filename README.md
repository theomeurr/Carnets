# Folio

Une application de prise de notes organisée comme un vrai classeur, sur trois
niveaux : **bloc-notes → sections → pages**.

- Autant de **bloc-notes** que voulu, chacun avec sa couleur, visible comme un
  onglet sur la tranche de la ligne.
- Des **sections** dans chaque bloc-notes, pour ranger les pages par thème.
- Des **pages** avec un éditeur de texte riche : titres, gras, italique,
  souligné, barré, listes à puces et numérotées, citations, code en ligne,
  blocs de code, liens.
- **Rien à enregistrer** : tout est écrit pendant la frappe, et l'indicateur du
  bandeau dit où en est la sauvegarde.
- **Recherche globale** (`Ctrl`/`⌘` + `K`) dans les titres et le contenu de
  toutes les pages, tous bloc-notes confondus, sans se soucier des accents ni
  de la casse.
- **Renommer** (double-clic ou menu `⋯`) et **supprimer** n'importe quel niveau,
  à tout moment.
- **Verrouiller** un bloc-notes, une section ou une page par mot de passe : le
  contenu est réellement chiffré, titre compris.
- **S'installer comme une application** et fonctionner **entièrement hors
  ligne**, y compris au tout premier lancement après installation.

L'interface tient en trois colonnes : les bloc-notes et leurs sections à
gauche, les pages de la section ouverte au milieu, la page à droite.

## Démarrer

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests unitaires (reducer, recherche, chiffrement, verrous)
npm run lint     # oxlint
npm run build    # vérification des types + build de production
```

## Sous le capot

React 19 + TypeScript, [Tiptap](https://tiptap.dev) (ProseMirror) pour
l'éditeur, Vite pour le build. Aucun serveur : les notes vivent dans
**IndexedDB**, dans le navigateur.

### Organisation du code

```
src/
  types.ts               le modèle : Notebook, Section, Page, Lock, Selection
  store/
    reducer.ts           toutes les transitions d'état, fonctions pures
    FolioProvider.tsx  l'état, les actions, l'enregistrement automatique
    context.ts           le contrat exposé à l'interface
    useFolio.ts        accès à l'état et vues dérivées des trois colonnes
    seed.ts              le classeur du premier lancement
    useVault.ts          la session déverrouillée, en mémoire seulement
    persistence/
      indexeddb.ts       le support principal, une entrée par note
      localstorage.ts    le repli, et la reprise de l'ancien format
      diff.ts            ce qui a changé depuis la dernière écriture
      assemble.ts        validation et remise en ordre à la relecture
      index.ts           ouverture, choix du support, reprise
  lib/
    search.ts            recherche globale, classement et extraits
    persist-storage.ts   demande de stockage non évinçable
    crypto.ts            dérivation de clé et chiffrement (WebCrypto)
    locks.ts             portée des verrous et règle de non-imbrication
    text.ts              repliage des accents, HTML → texte, dates
    colors.ts            la palette des bloc-notes
  components/            les trois colonnes, la barre d'outils, la recherche
  styles/                jetons de couleur, ossature, rendu du texte riche
```

### Quelques partis pris

**Des collections plates.** `notebooks`, `sections` et `pages` sont trois
tableaux ; le parent est un champ (`notebookId`, `sectionId`) et l'ordre
d'affichage est celui du tableau. Renommer ou supprimer touche donc une seule
entrée, sans parcours d'arbre.

**Une sélection qui se rattrape toute seule.** Après chaque action, `settle()`
redescend les trois niveaux et retombe sur le premier voisin disponible dès
qu'un maillon ne pointe plus sur rien. C'est ce qui rend les suppressions
triviales : chaque action retire ses données, et la vue rouvre quelque chose de
valide — jusqu'au classeur vide.

**Deux temporisations pour l'enregistrement.** L'éditeur renvoie son contenu au
magasin après 300 ms sans frappe ; le magasin écrit dans IndexedDB après 400 ms
sans changement. Passer l'onglet en arrière-plan déclenche l'écriture
immédiatement — IndexedDB étant asynchrone, mieux vaut ne pas attendre la
fermeture pour commencer.

**On n'écrit que ce qui a changé.** Chaque bloc-notes, section et page est une
entrée distincte. Avant d'écrire, `diff.ts` compare l'état à la dernière
version enregistrée **par identité d'objet** : le reducer ne recrée que ce
qu'il modifie, donc une page dont l'objet n'a pas bougé n'est pas réécrite.
Taper un caractère touche une page, pas le classeur. Le tout dans une seule
transaction : jamais de classeur à moitié enregistré.

**L'indicateur ne ment pas.** Une écriture qui échoue — quota plein, base
fermée — laisse le badge sur « Non enregistré » et ouvre un bandeau explicite,
au lieu d'afficher « Enregistré » sur des notes qui ne sont nulle part. L'état
en attente n'est pas considéré comme écrit : la tentative suivante reprend
l'ensemble des modifications non enregistrées.

**Un repli, et une reprise.** Si IndexedDB est hors service (certains modes de
navigation privée), l'application bascule sur `localStorage` plutôt que de
refuser de démarrer. Les notes d'une version antérieure y sont reprises
automatiquement au premier lancement, puis rangées sous
`carnets:sauvegarde-v1` — conservées en filet de sécurité, mais plus jamais
relues, pour que des notes supprimées ne puissent pas ressusciter.

**Le verrouillage chiffre pour de bon.** Poser un mot de passe dérive une clé
(PBKDF2-HMAC-SHA256, 600 000 itérations, sel propre à chaque verrou) et chiffre
les pages concernées en AES-GCM. Ce qui part sur le disque est le sel, le
nombre d'itérations, un témoin chiffré — et le contenu illisible. Le mot de
passe n'est enregistré nulle part, ni en clair ni en empreinte : un mot de
passe oublié rend les notes définitivement irrécupérables, et l'interface le
dit avant de verrouiller.

Le titre est chiffré avec le corps : une page verrouillée s'affiche « Page
verrouillée », sans rien laisser deviner. Une page verrouillée et fermée est
**écartée de la recherche** — ne pas l'afficher du tout, même comme résultat
masqué, évite de révéler qu'un mot recherché s'y trouve. Le déverrouillage vit
en mémoire (`useVault.ts`) : recharger la page referme tout, et **cinq minutes
sans activité** referment aussi. Le compte à rebours repart à la moindre frappe,
au moindre clic ou défilement — c'est l'inactivité continue qui est mesurée, pas
le temps écoulé depuis l'ouverture.

**Un seul verrou par branche.** Protéger un bloc-notes dont une section est
déjà protégée est refusé, avec l'explication. Sans cette règle, atteindre une
note pourrait demander deux mots de passe successifs, et le code devrait gérer
des clés en cascade.

**L'ordre est celui de la création.** Un magasin clé-valeur rend ses entrées
triées par identifiant : `assemble.ts` rétablit l'ordre à la relecture à partir
de `createdAt`. Le jour où le glisser-déposer arrivera, il faudra un champ
d'ordre explicite.

**Un éditeur par page.** La surface d'édition est montée avec l'identifiant de
la page pour clé : changer de page reconstruit l'éditeur, ce qui garantit un
contenu propre et un historique d'annulation qui ne déborde pas d'une page sur
l'autre.

**Pas de HTML réinjecté.** Le contenu riche ne traverse que l'éditeur, qui le
filtre par son schéma. Les aperçus, les extraits de recherche et le surlignage
sont construits à partir du texte brut et rendus comme des éléments React.

## Installer l'application

Folio est une PWA : depuis le site, le navigateur propose de l'installer, et
elle s'ouvre ensuite dans sa propre fenêtre, sans barre d'adresse.

- **Chrome / Edge (bureau)** : l'icône d'installation apparaît au bout de la
  barre d'adresse.
- **Android** : menu ⋮ → « Installer l'application ».
- **iOS / iPadOS** : Safari → Partager → « Sur l'écran d'accueil ». (Apple ne
  propose pas d'invite automatique.)

Une fois installée, l'application **fonctionne sans réseau** : tout le code est
mis en cache à l'installation, et les notes sont de toute façon dans le
navigateur. On peut écrire dans un train, un avion ou une cave.

Au démarrage, l'application demande le **stockage persistant**
(`navigator.storage.persist()`), qui empêche le navigateur d'effacer les notes
de lui-même quand l'espace disque vient à manquer. Une application installée
l'obtient en général sans rien demander ; un refus ne change rien au
fonctionnement, seulement au risque d'éviction.

Les mises à jour ne s'appliquent **jamais sans prévenir** : quand une nouvelle
version est prête, un bandeau propose de recharger. Recharger sous les doigts
de quelqu'un qui écrit — ou qui a des notes déverrouillées — n'est pas une
option.

## Déploiement

L'application est entièrement statique : `npm run build` produit un dossier
`dist/` qu'on peut servir tel quel, sans serveur ni base de données.

Le workflow `.github/workflows/deploy.yml` vérifie (types, lint, tests) puis
pousse `dist/` sur la branche `gh-pages` à chaque poussée sur `main`. Côté
dépôt, il faut régler une seule fois **Settings → Pages → Source : Deploy from
a branch → `gh-pages` / `(root)`**.

Le build utilise des **chemins relatifs**, donc le même `dist/` fonctionne à la
racine d'un domaine comme dans un sous-dossier : GitHub Pages, Netlify, Vercel,
Cloudflare Pages ou un simple dossier servi par nginx, sans rien reparamétrer.

Deux points à connaître avant de mettre en ligne :

- **HTTPS est obligatoire** — pour le verrouillage des notes (`crypto.subtle`
  n'existe que dans un contexte sécurisé) comme pour le service worker, sans
  lequel il n'y a ni installation ni hors ligne. `localhost` fait exception.
- **Les notes ne quittent jamais l'appareil.** Elles vivent dans IndexedDB, par
  origine : chaque visiteur a les siennes, et déployer ne partage aucune
  donnée. Il n'y a ni compte, ni synchronisation, ni serveur à administrer.

## Vérifier avant de pousser

```bash
npm run lint     # oxlint
npm test         # tests unitaires
npm run build    # vérification des types + build
```

Ce sont les trois commandes du workflow : si elles passent en local,
l'intégration continue passera aussi.

## Licence

[MIT](LICENSE).
