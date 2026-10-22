import { toast } from "sonner";
import { ConvexError } from "convex/values";

/** Extrait un message lisible d'une erreur Convex ou d'une exception JS. */
export function errorMessage(error: unknown, fallback = "Une erreur est survenue."): string {
  // Une ConvexError porte son message dans `data` : c'est le seul type
  // d'erreur serveur dont le texte n'est pas masqué en production.
  if (error instanceof ConvexError) {
    const data = error.data as { message?: unknown } | string;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (typeof data === "object" && typeof data?.message === "string") return data.message;
  }
  if (error instanceof Error && error.message) {
    // Les erreurs Convex arrivent préfixées par le chemin de la fonction :
    // on ne garde que la partie utile pour l'utilisateur.
    const cleaned = error.message.split("\n")[0].replace(/^\[.*?\]\s*/, "").trim();
    return cleaned || fallback;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

/**
 * Enveloppe une opération asynchrone avec un retour utilisateur complet :
 * état de chargement, succès, et message d'erreur exploitable.
 */
export async function withToast<T>(
  operation: () => Promise<T>,
  messages: {
    loading: string;
    success: string | ((result: T) => string);
    error?: string;
  }
): Promise<T | undefined> {
  const id = toast.loading(messages.loading);
  try {
    const result = await operation();
    toast.success(
      typeof messages.success === "function" ? messages.success(result) : messages.success,
      { id }
    );
    return result;
  } catch (error) {
    console.error(messages.error ?? "Operation failed", error);
    toast.error(errorMessage(error, messages.error), { id });
    return undefined;
  }
}

export { toast };
