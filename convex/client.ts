import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Par défaut, Convex demande « Quitter le site ? » dès qu'une requête est en
// vol — ce qui arrive en permanence pendant les synchronisations de fond.
// Rien n'est perdu à partir : les actions continuent côté serveur.
export const convexClient = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;

export const isConvexConfigured = Boolean(convexClient);
