# 🧭 Termenva — Agents de développement (v0.1)

## 🌟 Branding

- **Nom :** Termenva  
- **Tagline :** “Predict. Optimize. Master your portfolio.”  
- **Couleurs :** Noir `#0B0B0C`, Or `#C9A646`, Gris clair `#ECECEC`  
- **Police :** Space Grotesk / Satoshi  
- **Logo :** “O” stylisé (œil / halo de lumière)  
- **Domaines suggérés :** `termenva.ai`, `termenva.finance`, `termenva.app`

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
npx create-next-app@latest termenva
cd termenva
```

✅ 2. Installer TailwindCSS & Shadcn  

```bash
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn-ui@latest init
```

✅ 3. Configurer Convex  

```bash
npm install convex
npx convex dev --configure
```

→ Génère le dossier `/convex` avec les tables (users, portfolios, trades, etc.)

✅ 4. Ajouter Clerk pour l’auth  

```bash
npm install @clerk/nextjs
```

→ Configurer les variables :

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

✅ 5. Connecter Convex + Clerk  

`/convex/auth.ts`

```ts
import { auth } from "@clerk/nextjs/server";

export const getUserId = () => {
  const session = auth();
  return session.userId;
};
```

`/convex/_generated/server.ts`

```ts
import { query, mutation } from "./_generated/server";
import { getUserId } from "../auth";
```

✅ 6. Déployer sur Vercel (en test)

```bash
vercel
```

→ Vérifier que Clerk et Convex communiquent correctement.

### Phase 2 — Données Binance (v0.2) ✅ COMPLÉTÉE
- ✅ Créer `/convex/binance.ts` avec gestion complète de synchronisation
- ✅ Ajouter les fonctions pour récupérer :
  - `/api/v3/account` - Balances et détection de symboles
  - `/api/v3/myTrades` - Trades spot avec pagination
  - `/sapi/v1/convert/tradeFlow` - Conversions crypto-to-crypto
  - `/sapi/v1/fiat/orders` - Achats fiat (CB → crypto)
  - `/sapi/v1/capital/deposit/hisrec` - Dépôts
  - `/sapi/v1/capital/withdraw/history` - Retraits
- ✅ Sauvegarder les données dans `portfolios`, `trades`, `deposits`, `withdrawals`
- ✅ Créer un dashboard `/dashboard` avec :
  - Valeur totale du wallet et évolution
  - P&L (gains/pertes)
  - Performance par asset
  - Graphiques interactifs (prix, volume, distribution)
  - Onglet transactions avec filtres avancés

**🔧 Optimisations techniques implémentées :**
- Gestion rate limiting Binance (429) avec exponential backoff (5 retries, 5s base)
- Délais entre requêtes (1200ms) et entre types de sync (3s)
- Cursor-based pagination pour historique complet
- Champs FROM/TO stockés en base pour performances UI optimales
- Encryption des credentials API (AES-256-GCM)
- Normalisation des données entre sources (spot/convert/fiat)

**📊 Structure des données Binance :**

**Convert Trade** (API: `/sapi/v1/convert/tradeFlow`):
```typescript
{
  orderId: string;
  orderStatus: "SUCCESS" | "PROCESSING" | "FAILED";
  side?: "BUY" | "SELL";             // ⚠️ Parfois fourni, parfois calculé
  fromAsset: string;                 // Ex: "USDT"
  fromAmount: string;                // Ex: "10"
  toAsset: string;                   // Ex: "PYTH"
  toAmount: string;                  // Ex: "15.43629586"
  ratio: string;                     // Prix d'échange
  inverseRatio: string;              // Prix inverse
  fee?: string;
  feeAsset?: string;
  createTime: number;
  updateTime: number;
}
// Note: Le side est calculé via resolveConvertSymbol() si absent
```

**Spot Trade** (API: `/api/v3/myTrades`):
```typescript
{
  id: number;
  symbol: string;                    // Ex: "BTCUSDT"
  price: string;
  qty: string;                       // Quantité base asset
  quoteQty: string;                  // Quantité quote asset
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;                  // ⚠️ Utilisé pour déduire side
  isMaker: boolean;
}
```

**Normalisation en base :**
- Tous les trades (spot, convert, fiat) sont stockés dans la table `trades`
- Champs communs: `providerTradeId`, `symbol`, `side`, `quantity`, `price`, `executedAt`
- **Nouveaux champs optimisés**: `fromAsset`, `fromAmount`, `toAsset`, `toAmount`
- Permet affichage FROM → TO sans calcul frontend

### Phase 3 — Calculs quantitatifs (v0.3) 🚧 EN COURS
- ✅ Créer `/lib/metrics.ts` avec :
  - `sharpeRatio()`
  - `alphaBeta()`
  - `drawdown()`
- ✅ Intégrer dans `/convex/analytics.ts` pour stockage de métriques calculées
- ✅ Créer Action `/convex/actions/computePerformance.ts` pour calculs lourds asynchrones
- Visualiser les courbes sur `/dashboard` (Plotly / Recharts)

### Phase 4 — IA Recommandation (v0.4)
- Créer `/convex/ai.ts`
- Utiliser l’API OpenAI ou Google AI Studio :
  - Générer un résumé de performance
  - Produire 3 suggestions IA :
    - Réallocation
    - Stop loss
    - Gestion de risque

### Phase 5 — Design & UX (v0.5)
- Layout global avec sidebar / topbar (Shadcn)
- Dark mode + responsive mobile
- Cartes (`<Card>`) :
  - Alpha / Beta / Sharpe / P&L
  - Recommandations IA

---

## 🧠 Notes pour GPT-5 Codex
- Toujours coder en TypeScript strict
- Préserver la compatibilité Vercel + Convex
- Respecter le routing App Router (`app/`)
- Ne pas écrire d’API route manuelle pour Convex → tout passe par `/convex`
- Séparer logique et UI (`lib/metrics.ts` ≠ `app/dashboard/page.tsx`)
- Optimiser la performance (pas de requêtes bloquantes client)
- Code lisible, commenté, modulaire

---

## 🐛 Problèmes résolus (Session récente)

### 1. Rate Limiting Binance (429 errors)
**Problème :** Trop de requêtes simultanées causaient des bannissements de 10 minutes
**Solution :**
- Exponential backoff: 5s, 10s, 20s, 40s, 80s (max 5 retries)
- Délais inter-requêtes: 1200ms
- Délais inter-types: 3000ms
- `MAX_HISTORY_ITERATIONS` réduit de 200 à 20

### 2. Curseurs corrompus avec timestamps futurs
**Problème :** Curseurs contenaient des timestamps de mai 2025 alors qu'on était en octobre
**Solution :**
- Création de `convex/resetCursors.ts`
- Action pour reset manuel des curseurs corrompus
- Meilleure validation des timestamps

### 3. Overflow des logs
**Problème :** Plus de 256 lignes de logs causaient une troncature
**Solution :** Suppression des logs excessifs, conservation uniquement des logs essentiels

### 4. Affichage transactions pas clair
**Problème :** Difficile de voir "FROM → TO" dans les transactions
**Solution :**
- Ajout de `fromAsset`, `fromAmount`, `toAsset`, `toAmount` dans le schéma
- Calcul et stockage en base plutôt qu'en frontend
- Nouvelle UI avec colonnes FROM et TO claires

## 🚀 Prochaines étapes

### Immédiat (à faire)
- [ ] Tester la synchronisation complète après les fixes
- [ ] Vérifier que les champs FROM/TO s'affichent correctement
- [ ] Valider les performances avec un grand volume de données

### Court terme (Phase 3)
- [x] Créer `/lib/metrics.ts` avec calculs quantitatifs
- [x] Implémenter le stockage et le calcul asynchrone des métriques (Convex)
- [ ] Ajouter graphiques de performance avancés

### Moyen terme (Phase 4)
- [ ] Intégrer IA pour recommandations
- [ ] Générer résumés automatiques de performance
- [ ] Suggestions de réallocation de portfolio

---

## 📦 Structure actuelle

```text
app/
 ├─ dashboard/
 │   ├─ page.tsx                           ✅ Dashboard principal
 │   ├─ sections/
 │   │   ├─ overview/                      ✅ Vue d'ensemble (P&L, assets)
 │   │   ├─ performance/                   ✅ Graphiques de performance
 │   │   └─ transactions/                  ✅ Historique filtrable
 │   └─ components/
 │       ├─ topbar.tsx                     ✅ Barre de navigation
 │       └─ ...
 ├─ integrations/
 │   └─ binance/
 │       └─ connect/page.tsx               ✅ Connexion API Binance
 ├─ settings/
 │   └─ page.tsx                           ✅ Gestion des intégrations
 └─ page.tsx                               ✅ Landing page
convex/
 ├─ users.ts                               ✅ Gestion utilisateurs
 ├─ integrations.ts                        ✅ API keys & sync states
 ├─ portfolios.ts                          ✅ Agrégation des wallets
 ├─ trades.ts                              ✅ Historique de trades
 ├─ deposits.ts                            ✅ Dépôts crypto
 ├─ withdrawals.ts                         ✅ Retraits crypto
 ├─ binance.ts                             ✅ Synchronisation Binance
 ├─ resetCursors.ts                        ✅ Utilitaire reset curseurs
 ├─ schema.ts                              ✅ Schéma base de données
 └─ utils/
     └─ encryption.ts                      ✅ Chiffrement credentials
hooks/
 └─ dashboard/
     └─ useDashboardMetrics.ts             ✅ Calculs métriques temps réel
lib/
 └─ utils.ts                               ✅ Utilitaires généraux
components/
 └─ ui/                                    ✅ Composants Shadcn
public/
 ├─ icons/                                 ✅ Icônes PWA
 └─ sw.js                                  ✅ Service Worker
```

---

## 📘 Ressources utiles
- Clerk Docs → https://clerk.com/docs
- Convex Docs → https://docs.convex.dev
- Vercel → https://vercel.com
- Binance API → https://binance-docs.github.io/apidocs
- Google AI Studio → https://aistudio.google.com
