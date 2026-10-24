"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MCP_PATH } from "@/lib/mcp-auth";
import { cn } from "@/lib/utils";

/**
 * Mode d'emploi du connecteur Claude (serveur MCP `/api/mcp`).
 *
 * Affiché dans les réglages et dans le profil Clerk : il n'y a rien à
 * activer côté Hashory, tout se passe dans Claude. Le guide donne l'adresse
 * à copier et les gestes de chaque application.
 */

const TOOLS = [
  { name: "Comptes", detail: "Vos plateformes, wallets et imports, et leur synchronisation." },
  { name: "Portefeuille", detail: "Positions, valeur, prix de revient, plus-values latentes et réalisées." },
  { name: "Performance", detail: "Évolution de la valeur, apports nets, rendement et comparaison au Bitcoin." },
  { name: "Transactions", detail: "Échanges, dépôts et retraits, filtrables par actif, compte et période." },
  { name: "Fiscalité", detail: "Plus-values de cession par année (article 150 VH bis), cession par cession." },
];

const EXAMPLES = [
  "Quelle est la valeur de mon portefeuille et ma plus-value latente\u00a0?",
  "Résume ma performance depuis le 1er janvier, comparée au Bitcoin.",
  "Liste mes 20 derniers achats de BTC, toutes plateformes confondues.",
  "Combien de plus-value ai-je à déclarer pour 2025\u00a0?",
];

/**
 * Adresse du serveur MCP pour ce déploiement, lue dans le navigateur une fois
 * monté. Le premier rendu part d'une valeur identique côté serveur et client.
 */
function useMcpUrl() {
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://hashory.app");
  useEffect(() => setOrigin(window.location.origin), []);
  return `${origin}${MCP_PATH}`;
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copie impossible :", error);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-4 pr-1">
      <code className="num min-w-0 flex-1 truncate text-[13px] text-foreground">{value}</code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? `${label} copiée` : `Copier ${label}`}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-jade" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copié" : "Copier"}
      </button>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
          <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-jade-soft text-xs font-bold text-jade">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">{item}</div>
        </li>
      ))}
    </ol>
  );
}

const strong = (text: string) => <span className="font-bold text-foreground">{text}</span>;

export function ClaudeConnectorGuide({ compact = false }: { compact?: boolean }) {
  const url = useMcpUrl();
  const command = `claude mcp add --transport http hashory ${url}`;

  return (
    <div className={cn("space-y-8", compact && "space-y-6")}>
      <section>
        <h2 className="text-lg font-bold text-foreground">1. Copiez l&apos;adresse du connecteur</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          C&apos;est la seule information à donner à Claude. Elle est la même pour tous les
          utilisateurs : c&apos;est la connexion à votre compte qui choisit les données.
        </p>
        <div className="mt-4">
          <CopyField value={url} label="l'adresse" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-foreground">2. Ajoutez-le dans Claude</h2>
        <Tabs defaultValue="app" className="mt-4">
          <TabsList>
            <TabsTrigger value="app" className="cursor-pointer px-4">claude.ai et Desktop</TabsTrigger>
            <TabsTrigger value="code" className="cursor-pointer px-4">Claude Code</TabsTrigger>
          </TabsList>

          <TabsContent value="app">
            <Steps
              items={[
                <>Ouvrez {strong("Paramètres → Connecteurs")} dans claude.ai ou l&apos;application Claude Desktop.</>,
                <>Choisissez {strong("Ajouter un connecteur personnalisé")}, nommez-le « Hashory » et collez l&apos;adresse.</>,
                <>Cliquez sur {strong("Se connecter")} : une page Hashory s&apos;ouvre. Connectez-vous avec votre compte habituel et autorisez l&apos;accès.</>,
                <>Dans une conversation, activez Hashory depuis le menu des outils, puis posez votre question.</>,
              ]}
            />
            <p className="mt-4 text-xs text-muted-foreground">
              Les connecteurs personnalisés dépendent de votre offre Claude. En équipe ou en
              entreprise, un administrateur peut devoir ajouter le connecteur pour l&apos;organisation.
            </p>
          </TabsContent>

          <TabsContent value="code">
            <Steps
              items={[
                <>
                  Dans un terminal, ajoutez le serveur :
                  <div className="mt-3">
                    <CopyField value={command} label="la commande" />
                  </div>
                </>,
                <>Lancez Claude Code, tapez {strong("/mcp")}, sélectionnez « hashory » puis {strong("Authenticate")} : connectez-vous à Hashory dans le navigateur.</>,
              ]}
            />
          </TabsContent>
        </Tabs>
      </section>

      <section>
        <h2 className="text-lg font-bold text-foreground">3. Posez vos questions</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <li key={example} className="rounded-2xl bg-surface px-4 py-3 text-sm text-foreground">
              «&nbsp;{example}&nbsp;»
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-foreground">Ce que Claude peut consulter</h2>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
          {TOOLS.map((tool) => (
            <div key={tool.name} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:gap-4">
              <span className="w-32 shrink-0 text-sm font-bold text-foreground">{tool.name}</span>
              <span className="text-sm text-muted-foreground">{tool.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl bg-jade-soft px-5 py-4 text-sm text-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-jade" />
        <div className="space-y-2">
          <p>
            {strong("Lecture seule.")} Claude ne peut rien modifier, ni dans Hashory ni sur vos
            plateformes, et ne voit jamais vos clés d&apos;API.
          </p>
          <p>
            Les positions datent du dernier recalcul du portefeuille : ouvrez votre dashboard
            pour les mettre à jour avant de poser une question.
          </p>
          <p>
            Pour couper l&apos;accès, désactivez l&apos;interrupteur « Accès de Claude » : la requête
            suivante est refusée. Les montants fiscaux sont indicatifs et ne remplacent pas un conseil.
          </p>
        </div>
      </div>
    </div>
  );
}
