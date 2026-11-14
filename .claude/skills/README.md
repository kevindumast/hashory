# Skills de design d'Emil Kowalski

Huit skills de ce dossier viennent du dépôt
[emilkowalski/skills](https://github.com/emilkowalski/skills), sous licence MIT
(copie de la licence dans chaque dossier, fichier `LICENSE`).

- Source : https://github.com/emilkowalski/skills
- Commit : `0f2e23b32bb1265e84cff8d3e75785fec953fb1b` (13 novembre 2026)
- Copiés le 14 novembre 2026, **sans modification**.

| Skill | Rôle dans Hashory |
| --- | --- |
| `apple-design` | Réponse immédiate, ressorts, cohérence spatiale, matières, typographie, accessibilité |
| `emil-design-eng` | Courbes, durées, origine des popovers, checklist de revue |
| `animation-performance` | N'animer que `transform` / `opacity`, diagnostic des saccades |
| `choreograph` | Cascades et entrées groupées (`Reveal`, `WordReveal`) |
| `gestures` | Feuilles du bas et glisser-pour-fermer |
| `mobile-native` | Safe areas, `theme-color`, tap, zoom des champs, survol collant |
| `review-animations` | Revue stricte des animations (avec `STANDARDS.md`) |
| `pick-ui-library` | Choix de bibliothèque à partir d'une liste courte |

Non copiés, car hors sujet pour une application web Next.js ou redondants :
`animate`, `animate-expo`, `animation-vocabulary`, `ask-sonner`, `break-ui`,
`find-animation-opportunities`, `improve-animations`, `learn-taste`,
`prototype`, `remove-animations`, `write-swift`. Certains skills copiés y font
référence par chemin relatif (`../animate/SKILL.md`) : ces liens ne résolvent
pas ici, le contenu utile est repris dans `emil-design-eng`.

Pour mettre à jour : recloner le dépôt, relire les fichiers modifiés, les
recopier et changer le commit ci-dessus.

Les jetons de mouvement qui appliquent ces skills sont dans `app/globals.css`
(`--ease-out`, `--ease-in-out`, `--ease-drawer`, `--duration-*`).
