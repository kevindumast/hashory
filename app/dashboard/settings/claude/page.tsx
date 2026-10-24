import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClaudeAccessPanel } from "@/components/dashboard/claude-access-panel";
import { ClaudeConnectorGuide } from "@/components/dashboard/claude-connector-guide";

export const metadata = { title: "Connecter Claude" };

export default async function ClaudeConnectorPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-9 md:py-12">
      <p className="eyebrow">Réglages</p>
      <h1 className="title mt-3 text-3xl text-foreground sm:text-4xl">
        Interrogez votre portefeuille avec <span className="text-violet">Claude</span>
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Hashory se branche sur Claude comme connecteur. Une fois relié, Claude répond à vos
        questions à partir de vos vrais chiffres : valeur, performance, transactions et
        plus-values à déclarer. Rien à activer ici, tout se règle en deux minutes dans Claude.
      </p>
      <div className="mt-10">
        <ClaudeAccessPanel />
      </div>
      <div className="mt-10">
        <ClaudeConnectorGuide />
      </div>
    </div>
  );
}
