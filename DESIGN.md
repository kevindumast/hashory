# Direction artistique — Hashory

Une seule idée guide l'interface : **une page blanche, une encre, deux
accents**. Le fond est clair et quadrillé comme une feuille de travail, le
texte est d'une seule encre bleu nuit, et deux couleurs portent le sens :

- **violet** pour ce qui se *lit* : sources, sur-titres, mise en avant ;
- **jade** pour ce qui se *calcule* : gains, synchronisation, résultats.

Ce document fait foi pour toute nouvelle page ou tout nouveau composant.

---

## 1. Typographie

Une seule famille pour le texte, une mono pour les chiffres.

| Rôle | Classe | Police | Usage |
| --- | --- | --- | --- |
| Texte et titres | `font-sans` (défaut) | Calibri, puis Carlito | Tout, des titres aux libellés |
| Données | `.num` | JetBrains Mono | Montants, quantités, pourcentages, codes |

Calibri est servie d'abord quand elle est installée (Windows, macOS avec
Office) ; Carlito, métriquement identique, garantit le même rendu ailleurs.

**Titres** — la classe `.title` : gras, interligne `1.05`, approche qui
dépend de la taille (−0,018em à 20 px, −0,03em à 36 px, plafond −0,04em).
Le grand titre du hero descend à `-0.035em` et `leading-[1]`. Les petits
textes (`text-xs`) prennent une légère approche positive.

```tsx
<h2 className="title text-4xl text-foreground sm:text-5xl">
  Un outil financier mérite d&apos;être <span className="text-jade">vérifiable</span>.
</h2>
```

Un ou deux mots par titre peuvent prendre un accent (violet ou jade). Jamais
plus : c'est le mot qui porte l'idée, pas une décoration.

**Règles**

- Toute valeur chiffrée porte `.num` : les colonnes s'alignent et les nombres
  ne sautent plus quand ils se mettent à jour.
- Un `.num` combiné à `uppercase` redevient une étiquette en sans-serif grasse
  (règle dans `globals.css`) : ne l'utilisez pas pour forcer de la mono.

## 2. Sur-titres

Le sur-titre est la signature de la DA : capitales grasses, espacement
`0.22em`, en violet. Un par section, au-dessus du titre.

```tsx
<p className="eyebrow mb-5">Comment ça marche</p>
```

Variante neutre : `eyebrow text-muted-foreground` ; variante jade :
`eyebrow text-jade`.

## 3. Surfaces

La page alterne des bandes **blanches** et **grises** (`bg-surface`) pour
rythmer les sections, plutôt que des filets.

| Élément | Classes |
| --- | --- |
| Carte courante | `rounded-2xl border border-line bg-card` |
| Grande carte posée | `.float-card` (rayon 1.5rem, ombre longue et douce) |
| Bloc secondaire | `rounded-2xl bg-surface` sans bordure |
| Fond de hero | `.grid-paper` en calque absolu |

**Interdits** : dégradés d'ambiance, halos qui suivent le curseur, bordures
lumineuses, cartes vitrées (`backdrop-blur` sur un contenu), ombres courtes
et dures. La seule ombre est `--shadow-float`.

## 4. Pastilles

Les étiquettes, filtres et états sont des pastilles douces : fond teinté,
texte de la même teinte, gras.

```tsx
<span className="chip chip-violet">Agrégation</span>
<span className="chip chip-jade">Synchronisé</span>
<span className="chip">CSV</span>
```

## 5. Boutons et rayons

- Les boutons sont des **pilules** (`rounded-full`), en gras.
- L'action principale est à **l'encre** (`variant="default"`) — pas en
  violet. Le violet est une couleur de lecture, pas d'action.
- L'action secondaire est `variant="outline"`.
- `--radius` vaut `0.75rem` : champs et menus en héritent.

## 6. Couleur

Tous les jetons sont dans `app/globals.css`, déclinés en clair et en sombre.

| Jeton | Rôle |
| --- | --- |
| `ink` / `foreground` | Le texte, l'action principale |
| `slate` | Texte courant secondaire |
| `muted-foreground` | Descriptions, légendes |
| `faint` | Mentions discrètes, valeurs barrées |
| `line` | Bordures de carte, à peine visibles |
| `surface` | Bandes grises, blocs secondaires |
| `violet` / `violet-soft` | Accent de lecture |
| `jade` / `jade-soft` | Accent de calcul ; sert aussi de `positive` |
| `negative` | Pertes et erreurs uniquement |

- `--positive` / `--negative` sont **réservés aux valeurs financières** et aux
  états de synchronisation.
- Aucune couleur en dur dans les composants : toujours les jetons. Les
  graphiques passent par `var(--chart-1…5)`.

## 7. Mouvement

Le mouvement accompagne la lecture et répond au geste ; il ne décore pas.
Les règles viennent des skills `apple-design`, `emil-design-eng`,
`mobile-native` et `gestures` (`.claude/skills/`).

**Jetons** (`app/globals.css`) — jamais de courbe ni de durée en dur.

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Tout ce qui entre ou sort, l'appui |
| `ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Ce qui se déplace à l'écran |
| `ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Feuilles et tiroirs (courbe iOS) |
| `--duration-press` | 140 ms | Retour d'appui |
| `--duration-tooltip` / `-exit` | 150 / 100 ms | Infobulles |
| `--duration-popover` / `-exit` | 180 / 120 ms | Menus, listes |
| `--duration-modal` / `-exit` | 220 / 160 ms | Modales |
| `--duration-sheet` / `-exit` | 500 / 300 ms | Feuilles attachées à un bord |
| `--duration-theme` | 250 ms | Fondu clair ↔ sombre |

**Règles**

- La sortie est toujours plus rapide que l'entrée. Jamais `ease-in`.
- On n'anime que `transform` et `opacity` (hauteur mesurée d'un accordéon
  exceptée). Jamais `transition-all`.
- Tailwind v4 écrit `scale-*`, `translate-*`, `rotate-*` dans les propriétés
  `scale`, `translate`, `rotate` : c'est elles qu'on nomme dans
  `transition-[…]`, pas `transform`.
- Sur un élément animé par images clés (`animate-in`), la durée passe par
  `animation-duration-(--duration-…)`, pas `duration-*` : ce dernier pose
  aussi `transition-duration`, ce qui fait tout transitionner.
- Tout élément pressable porte `pressable` (`scale: 0.97` à l'appui). Une
  petite icône porte `touch-target` (zone tactile de 44 px au doigt).
- Les menus, listes et infobulles partent de leur déclencheur
  (`origin-(--radix-…-transform-origin)`), depuis 95 % et jamais de
  `scale(0)`. Les modales restent centrées.
- Rien d'animé sur une action au clavier fréquente : la palette ⌘K s'ouvre
  avec `animated={false}`. Une seconde infobulle voisine s'ouvre sans délai
  ni animation.
- `hover:` ne s'applique qu'aux pointeurs précis (`(hover: hover) and
  (pointer: fine)`, variante redéfinie globalement). En CSS écrit à la main,
  mettre le `:hover` dans ce même `@media`.
- Une feuille du bas (`SheetContent side="bottom"`) se ferme d'un glisser :
  suivi 1:1, résistance vers le haut, voile lié à la position, élan projeté,
  rattrapable en vol. Son contenu ne doit pas défiler ; un enfant qui garde
  ses gestes porte `data-sheet-no-drag`.
- Cascades : écarts qui raccourcissent (`staggerDelay`, `wordDelay`), une
  seule entrée par conteneur.

**Préférences système** — gérées globalement dans `globals.css` :
`prefers-reduced-motion` (fondus conservés, déplacements, zooms et boucles
coupés), `prefers-reduced-transparency` (surfaces `data-material` opaques,
sans flou), `prefers-contrast: more` (bordures et textes secondaires
renforcés).

| Composant | Usage |
| --- | --- |
| `WordReveal` | Titres de section : les mots montent un à un, segments teintables |
| `Reveal` | Apparition au défilement, en cascade (`delay={staggerDelay(index)}`) |
| `ScrollProgress` | Filet de lecture violet → jade sous l'en-tête |
| `GlowCard` | Carte interactive qui se soulève légèrement au survol |
| `NumberTicker` | Comptage des grandes valeurs. Options **sérialisables** (`prefix`, `suffix`, `decimals`) : une fonction ne franchit pas la frontière serveur → client |
| `Odometer` | Compteur à rouleaux pour les chiffres clés de la page d'accueil (les unités tournent en dernier). Mêmes options sérialisables que `NumberTicker` |
| `RollingText` | Libellé dont les lettres roulent d'une ligne au survol du parent `group` : liens de navigation, CTA principaux |
| `ScrollStack` | Étapes empilées au défilement (`sticky`), la carte recouverte recule légèrement |
| `CapabilityIndex` | Fonctionnalités en index numéroté : panneau latéral au survol sur grand écran, accordéon au toucher |

Ces quatre composants sont repris de React Bits (`Counter`, `ScrollStack`),
Skiper UI (« Rolling text », « Animated number », « Card stack scroll »,
« Hover expand ») et Vengeance UI (« Image reveal list »), puis réécrits
aux jetons et aux règles ci-dessus : pas de dépendance ajoutée. Avant d'en
reprendre un autre, vérifiez qu'il respecte les interdits de la section 3
(la plupart des effets WebGL, halos, curseurs et bordures lumineuses de
ces bibliothèques ne passent pas).

Dans « Le problème », l'ancienne façon de faire est barrée au crayon ligne
après ligne (`.strike-draw`), puis la coche se trace (`.check-draw`).

```tsx
<WordReveal
  className="title text-4xl sm:text-5xl"
  segments={[{ text: "Trois étapes," }, { text: "deux minutes.", tone: "violet" }]}
/>
```

## 8. Thèmes

Le thème clair est le thème de référence et celui par défaut. La bascule se
fait en fondu (`useThemeSwitch`, View Transitions) et `theme-color` suit le
thème actif (`ThemeColorSync`). Le sombre est
une déclinaison : mêmes rôles, accents éclaircis (`#a48ff0`, `#4cc49e`) pour
tenir le contraste sur fond bleu nuit. Clerk suit le thème actif
(`app/providers.tsx`, `components/auth/clerk-appearance.ts`).

## 9. Accessibilité

- Contraste : le texte secondaire utilise `text-muted-foreground`, jamais en
  dessous pour un texte à lire ; `text-faint` est réservé aux mentions.
- Tout élément interactif a un libellé accessible (`aria-label` sur les boutons
  à icône seule).
- Le focus clavier est visible partout (`:focus-visible` global dans
  `globals.css`) — ne le neutralisez pas.
- Les schémas décoratifs portent `aria-hidden` ; les titres découpés par
  `WordReveal` restent lisibles d'un bloc.
