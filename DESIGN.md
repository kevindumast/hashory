# Direction artistique — Hashory

Une seule idée guide l'interface : **Hashory est un instrument de lecture, pas
une brochure**. On emprunte donc le vocabulaire de la presse financière et du
terminal — filets fins, chiffres tabulaires, étiquettes en capitales — plutôt
que celui des landing pages SaaS génériques.

Ce document fait foi pour toute nouvelle page ou tout nouveau composant.

---

## 1. Typographie

Trois familles, trois rôles. Aucune ne déborde sur le rôle d'une autre.

| Rôle | Classe | Police | Usage |
| --- | --- | --- | --- |
| Titres | `font-serif` | Instrument Serif | Titres de page et de section |
| Texte | `font-sans` (défaut) | Sora | Paragraphes, descriptions, libellés de formulaire |
| Données | `.num` | JetBrains Mono | Chiffres, étiquettes en capitales, codes, badges |

**Règles**

- Les titres sérif sont toujours en `font-normal` — **jamais en gras**. Leur
  présence vient de la taille et du crénage, pas de la graisse.
- Interlignage serré sur les grands titres : `leading-[0.95]` à `leading-[1.05]`.
- Toute valeur chiffrée porte `.num` : les colonnes s'alignent et les nombres
  ne sautent plus quand ils se mettent à jour.
- Jamais de sérif sur un texte courant ni sur un élément d'interface.

```tsx
<h2 className="font-serif text-4xl font-normal leading-[1.05] text-foreground">
  Un outil financier mérite d&apos;être vérifiable.
</h2>
```

## 2. Étiquettes

L'étiquette en capitales espacées est la signature de la DA. Elle sert de
sur-titre, d'en-tête de colonne et de libellé d'indicateur.

```tsx
<p className="eyebrow">Sources connectables</p>
```

Équivalent en classes utilitaires quand une variante est nécessaire :
`num text-[10px] uppercase tracking-[0.24em] text-muted-foreground`.

## 3. Structure : des filets, pas des cartes

La mise en page repose sur des **filets d'un pixel**, pas sur des cartes
flottantes. C'est le point le plus important de la DA.

- Séparateurs : `border-border/60`.
- Une liste est une suite de lignes séparées par `border-b border-border/60`,
  avec `hover:bg-muted/20` pour le survol.
- **Interdits** : `shadow-*` décoratifs, dégradés d'ambiance, `bg-*/5` colorés
  posés sur des blocs entiers, pastilles arrondies (`rounded-full` sur un badge
  texte), grilles de cartes à icône.
- Les sections numérotées portent un en-tête `01 — LE PROBLÈME` suivi d'un filet.

```tsx
<div className="flex items-baseline gap-4 border-b border-border/60 pb-4">
  <span className="num text-xs text-primary">01</span>
  <span className="num text-xs uppercase tracking-[0.28em] text-muted-foreground">
    Le problème
  </span>
</div>
```

## 4. Rayons

`--radius` vaut `0.25rem`. Tout en hérite : les boutons, champs, dialogues et
panneaux sont quasi vifs. **N'ajoutez pas de `rounded-*` en dur** — laissez le
jeton faire son travail.

Seules exceptions, qui restent rondes : les avatars et les pastilles d'état
(le point de synchronisation, la puce d'une puce de liste).

## 5. Couleur

Monochrome, plus un accent rare.

- `--primary` : numéros de section, une valeur mise en avant, l'action
  principale. Si tout est accentué, plus rien ne l'est.
- `--positive` / `--negative` : **réservés aux valeurs financières** (P&L,
  variation) et aux états de synchronisation. Jamais décoratifs.
- Les fonds de bloc restent `bg-background` ou `bg-[var(--surface-low)]`.
- Aucune couleur en dur : toujours les jetons.

## 6. Densité

Une interface de données assume la densité. Préférez une ligne de tableau
serrée à une carte aérée. L'espace se met **entre les sections**
(`py-24`, `lg:py-32`), pas à l'intérieur des blocs.

## 7. Mouvement

Le mouvement souligne la structure, il ne la décore pas. Tout est dans
`@/components/motion` et respecte `prefers-reduced-motion`.

| Composant | Usage |
| --- | --- |
| `Reveal` | Apparition au défilement, en cascade (`delay` de 60 à 80 ms par élément) |
| `GlowCard` | Bordure qui s'illumine sous le curseur — sur les blocs interactifs |
| `Magnetic` | Attraction légère — réservée aux appels à l'action principaux |
| `NumberTicker` | Comptage des grandes valeurs. Ses options sont **sérialisables** (`prefix`, `suffix`, `decimals`) : une fonction ne franchit pas la frontière serveur → client |
| `PointerAmbience` | Halo global suivant le curseur — une seule fois par page |
| `DecoderField` | Signature de la page d'accueil : le curseur décode des mots dans un bruit de hash |

## 8. Accessibilité

- Contraste : le texte secondaire utilise `text-muted-foreground`, jamais en
  dessous.
- Tout élément interactif a un libellé accessible (`aria-label` sur les boutons
  à icône seule).
- Le focus clavier est visible partout (`:focus-visible` global dans
  `globals.css`) — ne le neutralisez pas.
- Le mouvement s'annule intégralement sous `prefers-reduced-motion: reduce`.
