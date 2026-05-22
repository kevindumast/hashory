This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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
        AI[ai actions]
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
    AI --> AnalyticsDB
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
