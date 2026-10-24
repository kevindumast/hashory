<div align="center">

# Hashory

**Tous vos actifs crypto — exchanges, wallets on-chain et imports de fichiers — dans un seul terminal.**

Agrégation de portefeuille, calcul de P&L, analyse de saisonnalité et déclaration fiscale française,
en open source et en lecture seule.

[![Next.js](https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev)
[![Convex](https://img.shields.io/badge/Convex-backend-f26d21)](https://convex.dev)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-9bffce)](#licence)

</div>

---

## Ce que fait Hashory

- **Agrège vos sources.** Binance et KuCoin via API en lecture seule ; Bitcoin, Ethereum, Solana,
  Kaspa et Bittensor via adresse publique ; Bitstack, Finary et Strike via import CSV.
- **Reconstitue votre historique.** Trades, conversions, dépôts, retraits, ordres, soldes et
  poussière — l'intégralité de votre activité, sans ressaisie.
- **Calcule votre performance.** P&L par actif, par période et par plateforme, prix de revient
  moyen, répartition et évolution de la valeur du portefeuille.
- **Prépare votre déclaration.** Plus-values de cession d'actifs numériques calculées selon
  l'article 150 VH bis du CGI, avec le détail cession par cession.
- **Analyse la saisonnalité.** Le comportement de vos actifs mois par mois, pour situer votre
  performance dans le cycle.

> **Sécurité par conception.** Hashory ne demande que des accès en **lecture seule**. Les clés API
> sont chiffrées avant stockage, les wallets sont suivis via leur adresse publique uniquement.
> Aucun chemin technique ne permet de déplacer vos fonds.

## Architecture

```mermaid
flowchart LR
    User([👤 Utilisateur])

    subgraph Frontend["Frontend — Next.js 15 / React 19"]
        Landing[Landing / Pricing]
        Auth[Auth Clerk<br/>sign-in · sign-up]
        Dashboard[Dashboard]
        Overview[Overview<br/>Portfolio]
        Transactions[Transactions]
        Analytics[Analytics]
        Integrations[Integrations]
        TaxReport[Tax Report]
    end

    subgraph API["API Routes"]
        Prices[/api/prices/]
    end

    subgraph Backend["Backend — Convex"]
        Portfolios[(portfolios)]
        Trades[(trades)]
        Orders[(orders)]
        Deposits[(deposits)]
        Withdrawals[(withdrawals)]
        Balances[(balances)]
        Fiat[(fiatTransactions)]
        Users[(users)]
        AnalyticsDB[(analytics)]
        IntegrationsFn[integrations]
    end

    subgraph External["Services externes"]
        Binance[🟡 Binance API]
        Kaspa[🔵 Kaspa API]
        CMC[CoinMarketCap]
        Clerk[Clerk Auth]
    end

    User --> Landing
    User --> Auth
    Auth <--> Clerk
    User --> Dashboard
    Dashboard --> Overview
    Dashboard --> Transactions
    Dashboard --> Analytics
    Dashboard --> Integrations
    Dashboard --> TaxReport

    Overview --> Prices
    Prices --> CMC

    Dashboard <--> Backend
    Integrations --> IntegrationsFn
    IntegrationsFn --> Binance
    IntegrationsFn --> Kaspa
    Binance --> Trades
    Binance --> Orders
    Binance --> Deposits
    Binance --> Withdrawals
    Binance --> Balances
    Kaspa --> Trades
```

## Stack

| Couche | Technologie |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styles | Tailwind CSS v4, Radix UI, composants shadcn/ui |
| Backend & base | Convex (fonctions, requêtes temps réel, actions) |
| Authentification | Clerk |
| Graphiques | Recharts |
| Hébergement | Vercel |

## Démarrage

**Prérequis :** Node.js 22+, un compte [Convex](https://convex.dev) et un compte
[Clerk](https://clerk.com).

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env.local   # puis renseignez vos clés

# 3. Lancer le backend Convex (dans un terminal dédié)
npm run convex:dev

# 4. Lancer l'application
npm run dev
```

L'application est disponible sur [http://localhost:3000](http://localhost:3000).

### Variables d'environnement

Toutes les variables sont documentées dans [`.env.example`](.env.example). Les indispensables :

| Variable | Rôle |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Authentification Clerk |
| `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_DEPLOYMENT` | Déploiement Convex |
| `CLERK_JWT_ISSUER_DOMAIN` | Vérification du jeton côté Convex |
| `ORACLY_ENCRYPTION_KEY` | Clé de chiffrement des identifiants d'exchange (32 caractères) |
| `CMC_API_KEY` | Prix et métadonnées CoinMarketCap |
| `NEXT_PUBLIC_SITE_URL` | URL publique, pour les métadonnées et le sitemap |
| `MCP_SERVER_SECRET` | Secret partagé entre le serveur MCP et Convex (voir ci-dessous) |

## Serveur MCP pour Claude

Hashory expose un serveur [MCP](https://modelcontextprotocol.io) sur `/api/mcp` : Claude
(claude.ai, Claude Desktop, Claude Code) peut lire votre portefeuille et répondre à des
questions comme « quelle est ma plus-value 2025 ? » ou « montre mes derniers achats de BTC ».
Tous les outils sont en **lecture seule**.

| Outil | Ce qu'il renvoie |
| --- | --- |
| `list_accounts` | Comptes reliés et état de synchronisation |
| `get_portfolio` | Positions, valeur, prix de revient, latent et réalisé (option : par compte) |
| `get_performance` | Valeur, apports nets, TWR et comparaison au BTC sur une période |
| `list_transactions` | Échanges, dépôts et retraits, filtrables par actif, type, compte et dates |
| `get_tax_report` | Plus-values 150 VH bis par année, avec le détail des cessions en option |

**Mise en place**

1. Dans le dashboard Clerk, *Configure → OAuth applications* : activez
   **Dynamic client registration**. Claude y inscrit son client, puis l'utilisateur se connecte
   avec son compte Hashory.
2. Générez un secret (`openssl rand -hex 32`) et définissez-le **aux deux endroits** :
   `MCP_SERVER_SECRET` dans les variables d'environnement Next.js (Vercel) et
   `npx convex env set MCP_SERVER_SECRET <secret>` côté Convex.
3. Déployez Convex (`npx convex deploy`) puis l'application.
4. Dans Claude : *Settings → Connectors → Add custom connector*, URL
   `https://<votre-domaine>/api/mcp`. Avec Claude Code :
   `claude mcp add --transport http hashory https://<votre-domaine>/api/mcp`.

Côté utilisateur, le mode d'emploi est dans l'application : *Réglages → Connecter Claude*
(`/dashboard/settings/claude`), aussi accessible depuis le menu du compte et la fenêtre du profil
(onglet « Claude »). Il donne l'adresse à copier et les étapes pour claude.ai, Claude Desktop et
Claude Code.

Le jeton OAuth est vérifié par Clerk à chaque requête ; le serveur interroge ensuite Convex avec
l'identifiant vérifié et le secret partagé (`convex/mcp.ts`). Sans ce secret, Convex refuse
toute lecture.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement Next.js |
| `npm run convex:dev` | Backend Convex en mode watch |
| `npm run build` | Build de production |
| `npm run start` | Serveur de production |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Vérification des types |

## Déploiement

Hashory est conçu pour être auto-hébergeable. Le plus simple est
[Vercel](https://vercel.com/new) : importez le dépôt, renseignez les mêmes variables
d'environnement, et déployez votre backend Convex avec `npx convex deploy`.

## Contribuer

Les contributions sont bienvenues — en particulier les nouvelles intégrations d'exchanges et de
blockchains. Les messages de commit suivent la convention
[Conventional Commits](https://www.conventionalcommits.org/fr/) : le changelog et les versions sont
générés automatiquement par release-please.

## Licence

MIT.
