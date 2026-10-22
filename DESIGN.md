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

**Titres** — la classe `.title` : gras, approche `-0.03em`, interligne `1.05`.
Le grand titre du hero descend à `-0.035em` et `leading-[1]`.

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

Le mouvement accompagne la lecture, il ne réagit pas au curseur. Tout est
dans `@/components/motion` et respecte `prefers-reduced-motion`.

| Composant | Usage |
| --- | --- |
| `WordReveal` | Titres de section : les mots montent un à un, segments teintables |
| `Reveal` | Apparition au défilement, en cascade (`delay` de 60 à 100 ms) |
| `ScrollProgress` | Filet de lecture violet → jade sous l'en-tête |
| `GlowCard` | Carte interactive qui se soulève légèrement au survol |
| `NumberTicker` | Comptage des grandes valeurs. Options **sérialisables** (`prefix`, `suffix`, `decimals`) : une fonction ne franchit pas la frontière serveur → client |

```tsx
<WordReveal
  className="title text-4xl sm:text-5xl"
  segments={[{ text: "Trois étapes," }, { text: "deux minutes.", tone: "violet" }]}
/>
```

## 8. Thèmes

Le thème clair est le thème de référence et celui par défaut. Le sombre est
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
