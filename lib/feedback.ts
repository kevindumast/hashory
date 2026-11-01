/**
 * Retours « bug ou idée » envoyés depuis le tableau de bord : validation du
 * formulaire et contenu de l'issue GitHub créée pour le tri.
 */

export const FEEDBACK_KINDS = ["bug", "idee"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Envois autorisés par utilisateur sur une heure glissante. */
export const FEEDBACK_LIMIT_PER_HOUR = 5;

export const FEEDBACK_TITLE_MAX = 120;
export const FEEDBACK_BODY_MAX = 5000;
const TITLE_MIN = 3;
const BODY_MIN = 10;

const LABELS: Record<FeedbackKind, string[]> = {
  bug: ["bug", "retour utilisateur"],
  idee: ["enhancement", "retour utilisateur"],
};

const PREFIX: Record<FeedbackKind, string> = { bug: "[Bug]", idee: "[Idée]" };

export type FeedbackInput = { kind: string; title: string; body: string; page?: string };

/** Message d'erreur à afficher, ou null si le retour peut partir. */
export function feedbackError(input: FeedbackInput): string | null {
  if (!(FEEDBACK_KINDS as readonly string[]).includes(input.kind)) return "Choisissez un type de retour.";
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < TITLE_MIN) return "Le titre est trop court.";
  if (title.length > FEEDBACK_TITLE_MAX) return `Le titre dépasse ${FEEDBACK_TITLE_MAX} caractères.`;
  if (body.length < BODY_MIN) return "Ajoutez quelques détails (10 caractères minimum).";
  if (body.length > FEEDBACK_BODY_MAX) return `Les détails dépassent ${FEEDBACK_BODY_MAX} caractères.`;
  return null;
}

/** Seul un chemin interne au site est conservé : une URL externe est ignorée. */
export function feedbackPage(page: string | undefined): string | null {
  if (!page || !page.startsWith("/") || page.startsWith("//")) return null;
  return page.slice(0, 200);
}

/** Le texte vient des utilisateurs : on désamorce les @mentions pour ne notifier personne sur GitHub. */
function neutralize(text: string) {
  return text.replace(/@(?=[\w-])/g, "@​");
}

/** Contenu de l'issue GitHub : le compte est désigné par son identifiant, jamais par son e-mail. */
export function feedbackIssue(input: {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  page: string | null;
  userId: string;
  userAgent: string | null;
}) {
  const details = [
    ["Page", input.page ? `\`${input.page.replace(/`/g, "")}\`` : "—"],
    ["Navigateur", input.userAgent ? `\`${input.userAgent.replace(/`/g, "")}\`` : "—"],
    ["Compte", `\`${input.userId}\``],
    ["Retour", `\`${input.id}\``],
  ];
  return {
    title: `${PREFIX[input.kind]} ${neutralize(input.title.trim())}`,
    body: [
      neutralize(input.body.trim()),
      "",
      "---",
      "_Envoyé depuis Hashory._",
      "",
      "| | |",
      "|---|---|",
      ...details.map(([k, v]) => `| ${k} | ${v} |`),
    ].join("\n"),
    labels: LABELS[input.kind],
  };
}
