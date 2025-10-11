# 🧭 Oracly — Agents de développement (v0.1)

## 🌟 Branding

- **Nom :** Oracly  
- **Tagline :** “Predict. Optimize. Master your portfolio.”  
- **Couleurs :** Noir `#0B0B0C`, Or `#C9A646`, Gris clair `#ECECEC`  
- **Police :** Space Grotesk / Satoshi  
- **Logo :** “O” stylisé (œil / halo de lumière)  
- **Domaines suggérés :** `oracly.ai`, `oracly.finance`, `oracly.app`  

---

## 🎯 Objectif MVP
Créer une base solide **Next.js + Convex + Clerk + Vercel** pour un SaaS de suivi de portefeuille crypto (Binance au départ), avec authentification, stockage temps réel et IA à venir.

---

## 🧰 Stack Technique

- **Framework** : Next.js 15 (App Router)
- **Base de données / backend** : Convex
- **Authentification** : Clerk
- **Hébergement** : Vercel
- **Langage** : TypeScript
- **UI** : Shadcn/UI + TailwindCSS
- **IA (plus tard)** : OpenAI / Google AI Studio
- **Source de données** : Binance API

---

## 🧩 Étapes de développement

### Phase 1 — Fondations
✅ 1. Créer le projet Next.js  
```bash
npx create-next-app@latest oracly
cd oracly
✅ 2. Installer TailwindCSS & Shadcn

bash
Copier le code
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn-ui@latest init
✅ 3. Configurer Convex

bash
Copier le code
npm install convex
npx convex dev --configure
→ Génère le dossier /convex avec les tables (users, portfolios, trades, etc.)

✅ 4. Ajouter Clerk pour l’auth

bash
Copier le code
npm install @clerk/nextjs
→ Configurer les variables :

env
Copier le code
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
✅ 5. Connecter Convex + Clerk
/convex/auth.ts :

ts
Copier le code
import { auth } from "@clerk/nextjs/server";

export const getUserId = () => {
  const session = auth();
  return session.userId;
};
/convex/_generated/server.ts :

ts
Copier le code
import { query, mutation } from "./_generated/server";
import { getUserId } from "../auth";
✅ 6. Déployer sur Vercel (en test)

bash
Copier le code
vercel
→ Vérifier que Clerk et Convex communiquent correctement.

Phase 2 — Données Binance (v0.2)
Créer /convex/binance.ts

Ajouter les fonctions pour récupérer :

/api/v3/account

/api/v3/myTrades

Sauvegarder les données dans portfolios et trades

Créer un dashboard /dashboard :

Valeur totale du wallet

P&L

Liste des positions

Phase 3 — Calculs quantitatifs (v0.3)
Créer /lib/metrics.ts avec :

sharpeRatio()

alphaBeta()

drawdown()

Intégrer dans /convex/analytics.ts pour stockage de métriques calculées

Visualiser les courbes sur /dashboard (Plotly / Recharts)

Phase 4 — IA Recommandation (v0.4)
Créer /convex/ai.ts

Utiliser l’API OpenAI ou Google AI Studio :

Générer un résumé de performance

Produire 3 suggestions IA :

Réallocation

Stop loss

Gestion de risque

Phase 5 — Design & UX (v0.5)
Layout global avec sidebar / topbar (Shadcn)

Dark mode + responsive mobile

Cartes (<Card>) :

Alpha / Beta / Sharpe / P&L

Recommandations IA

🧠 Notes pour GPT-5 Codex
Toujours coder en TypeScript strict

Préserver la compatibilité Vercel + Convex

Respecter le routing App Router (app/)

Ne pas écrire d’API route manuelle pour Convex → tout passe par /convex

Séparer logique et UI (lib/metrics.ts ≠ app/dashboard/page.tsx)

Optimiser la performance (pas de requêtes bloquantes client)

Code lisible, commenté, modulaire

🚀 Prochaines étapes
 Créer le repo GitHub oracly

 Lier à Vercel + Convex + Clerk

 Créer premières fonctions Convex (users, portfolios, trades)

 Valider la boucle auth → stockage → affichage

📦 Structure cible
vbnet
Copier le code
app/
 ├─ dashboard/
 │   ├─ page.tsx
 │   └─ components/
 │       ├─ PortfolioCard.tsx
 │       └─ MetricChart.tsx
 ├─ api/
 │   └─ binance/
 │       └─ route.ts (proxy si besoin)
convex/
 ├─ users.ts
 ├─ portfolios.ts
 ├─ trades.ts
 ├─ analytics.ts
 ├─ ai.ts
 └─ schema.ts
lib/
 ├─ binance.ts
 ├─ metrics.ts
 └─ aiEngine.ts
public/
 └─ logo_oracly.svg
📘 Ressources utiles
Clerk Docs → https://clerk.com/docs

Convex Docs → https://docs.convex.dev

Vercel → https://vercel.com

Binance API → https://binance-docs.github.io/apidocs

Google AI Studio → https://aistudio.google.com