import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Metadata } from "next";

import { Reveal } from "@/components/motion";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/lib/site";

/** Le CHANGELOG est un fichier du dépôt : il est figé au build. */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Changelog",
  description: `Toutes les nouveautés, corrections et améliorations livrées sur ${siteConfig.name}, version après version.`,
};

/* ─── Modèle ──────────────────────────────────────────────────── */

type SectionTone = "features" | "fixes" | "perf" | "neutral";

type ChangelogEntry = {
  message: string;
  commitLabel: string | null;
  commitUrl: string | null;
};

type ChangelogSection = {
  label: string;
  tone: SectionTone;
  entries: ChangelogEntry[];
};

type ChangelogRelease = {
  version: string;
  compareUrl: string | null;
  date: string | null;
  sections: ChangelogSection[];
};

/* ─── Parseur ─────────────────────────────────────────────────────
   release-please produit un markdown très régulier :

     ## [0.1.2](lien-de-comparaison) (2026-07-11)
     ### Features
     * message ([sha](lien-de-commit))

   Le parseur reste néanmoins tolérant : titre sans lien, section
   inconnue, puce sans commit, tiret au lieu d'astérisque. Si rien
   n'est reconnu, la page retombe proprement sur le texte brut.
   ─────────────────────────────────────────────────────────────── */

const RELEASE_HEADING = /^##(?!#)\s+(.+)$/;
const SECTION_HEADING = /^###\s+(.+)$/;
const BULLET = /^[*-]\s+(.+)$/;
const MARKDOWN_LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;
const TRAILING_DATE = /\((\d{4}-\d{2}-\d{2})\)\s*$/;
const TRAILING_COMMIT = /\(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\)\s*$/;

const INLINE_LINK = /\[([^\]]*)\]\([^)\s]*\)/g;
const INLINE_BOLD = /\*\*([^*]+)\*\*/g;
const INLINE_CODE = /`([^`]+)`/g;

/** Retire le balisage inline (liens, gras, code) sans dépendance externe. */
function stripInlineMarkdown(value: string): string {
  return value
    .replace(INLINE_LINK, "$1")
    .replace(INLINE_BOLD, "$1")
    .replace(INLINE_CODE, "$1")
    .trim();
}

const SECTION_DICTIONARY: Record<string, { label: string; tone: SectionTone }> = {
  features: { label: "Nouveautés", tone: "features" },
  "bug fixes": { label: "Corrections", tone: "fixes" },
  "performance improvements": { label: "Performances", tone: "perf" },
  "code refactoring": { label: "Refonte", tone: "neutral" },
  refactoring: { label: "Refonte", tone: "neutral" },
  reverts: { label: "Retours arrière", tone: "neutral" },
  documentation: { label: "Documentation", tone: "neutral" },
  "miscellaneous chores": { label: "Maintenance", tone: "neutral" },
  "build system": { label: "Build", tone: "neutral" },
  "continuous integration": { label: "Intégration continue", tone: "neutral" },
  tests: { label: "Tests", tone: "neutral" },
  styles: { label: "Style", tone: "neutral" },
};

function describeSection(rawTitle: string): { label: string; tone: SectionTone } {
  return (
    SECTION_DICTIONARY[rawTitle.toLowerCase()] ?? {
      label: rawTitle,
      tone: "neutral" as const,
    }
  );
}

function parseReleaseHeading(raw: string): Omit<ChangelogRelease, "sections"> {
  let rest = raw.trim();
  let date: string | null = null;

  const dateMatch = rest.match(TRAILING_DATE);
  if (dateMatch && dateMatch.index !== undefined) {
    date = dateMatch[1];
    rest = rest.slice(0, dateMatch.index).trim();
  }

  let version = rest;
  let compareUrl: string | null = null;

  const linkMatch = rest.match(MARKDOWN_LINK);
  if (linkMatch) {
    version = linkMatch[1];
    compareUrl = linkMatch[2];
  }

  return { version: stripInlineMarkdown(version), compareUrl, date };
}

function parseEntry(raw: string): ChangelogEntry {
  let message = raw.trim();
  let commitLabel: string | null = null;
  let commitUrl: string | null = null;

  const commitMatch = message.match(TRAILING_COMMIT);
  if (commitMatch && commitMatch.index !== undefined) {
    commitLabel = stripInlineMarkdown(commitMatch[1]);
    commitUrl = commitMatch[2];
    message = message.slice(0, commitMatch.index).trim();
  }

  return { message: stripInlineMarkdown(message), commitLabel, commitUrl };
}

function parseChangelog(source: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const releaseMatch = trimmed.match(RELEASE_HEADING);
    if (releaseMatch) {
      release = { ...parseReleaseHeading(releaseMatch[1]), sections: [] };
      releases.push(release);
      section = null;
      continue;
    }

    // Tout ce qui précède la première version (le titre « # Changelog »)
    // n'appartient à aucune release : on l'ignore.
    if (!release) continue;

    const sectionMatch = trimmed.match(SECTION_HEADING);
    if (sectionMatch) {
      section = {
        ...describeSection(stripInlineMarkdown(sectionMatch[1])),
        entries: [],
      };
      release.sections.push(section);
      continue;
    }

    const bulletMatch = trimmed.match(BULLET);
    if (bulletMatch) {
      if (!section) {
        // Puce orpheline : on la rattache à une section générique.
        section = { label: "Modifications", tone: "neutral", entries: [] };
        release.sections.push(section);
      }
      const entry = parseEntry(bulletMatch[1]);
      if (entry.message) section.entries.push(entry);
    }
  }

  return releases
    .map((item) => ({
      ...item,
      sections: item.sections.filter((current) => current.entries.length > 0),
    }))
    .filter((item) => item.version.length > 0 && item.sections.length > 0);
}

/* ─── Présentation ────────────────────────────────────────────── */

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateFormatter.format(parsed);
}

const TONE_CLASSES: Record<SectionTone, string> = {
  features: "text-positive",
  fixes: "text-destructive",
  perf: "text-primary",
  neutral: "text-muted-foreground",
};

async function readChangelog(): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
  } catch {
    return null;
  }
}

export default async function ChangelogPage() {
  const source = await readChangelog();
  const releases = source ? parseChangelog(source) : [];

  return (
    <>
      <main className="bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-24 sm:px-6 lg:pb-32 lg:pt-32">
          <Reveal as="header">
            <p className="num flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              <span className="h-px w-6 bg-primary" />
              {siteConfig.name}
            </p>
            <h1 className="mt-6 font-serif text-5xl font-normal leading-[1.02] text-foreground sm:text-6xl">
              Changelog
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Chaque version livrée, ses nouveautés et ses corrections. Cette page
              est générée automatiquement à partir de l&apos;historique du dépôt.
            </p>
          </Reveal>

          {releases.length > 0 ? (
            <div className="mt-16 border-t border-border/60">
              <ol>
                {releases.map((release, index) => {
                  const formattedDate = formatDate(release.date);

                  return (
                    <Reveal
                      as="li"
                      key={`${release.version}-${index}`}
                      delay={Math.min(index * 60, 240)}
                      className="border-b border-border/60 py-10"
                    >

                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="num text-xl font-semibold tracking-tight text-foreground">
                          {release.version}
                        </h2>
                        {formattedDate ? (
                          <time
                            dateTime={release.date ?? undefined}
                            className="text-sm text-muted-foreground"
                          >
                            {formattedDate}
                          </time>
                        ) : null}
                        {index === 0 ? (
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.7rem] font-medium text-primary">
                            Dernière version
                          </span>
                        ) : null}
                      </div>

                      {release.compareUrl ? (
                        <a
                          href={release.compareUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-1 inline-block text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                        >
                          Comparer les modifications
                        </a>
                      ) : null}

                      <div className="mt-6 space-y-6">
                        {release.sections.map((section) => (
                          <section key={section.label}>
                            <h3
                              className={`num text-[10px] uppercase tracking-[0.24em] ${TONE_CLASSES[section.tone]}`}
                            >
                              {section.label}
                            </h3>

                            <ul className="mt-3 space-y-2">
                              {section.entries.map((entry, entryIndex) => (
                                <li
                                  key={`${entry.commitLabel ?? entry.message}-${entryIndex}`}
                                  className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                                >
                                  <span
                                    aria-hidden
                                    className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-border"
                                  />
                                  <span className="min-w-0">
                                    {entry.message}
                                    {entry.commitUrl && entry.commitLabel ? (
                                      <>
                                        {" "}
                                        <a
                                          href={entry.commitUrl}
                                          target="_blank"
                                          rel="noreferrer noopener"
                                          title="Voir le commit sur GitHub"
                                          className="num text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
                                        >
                                          {entry.commitLabel}
                                        </a>
                                      </>
                                    ) : null}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    </Reveal>
                  );
                })}
              </ol>
            </div>
          ) : source ? (
            // Format inattendu : mieux vaut montrer le fichier brut que rien.
            <pre className="scrollbar-subtle mt-16 overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-[var(--surface-low)] p-6 text-xs leading-relaxed text-muted-foreground">
              {source}
            </pre>
          ) : (
            <p className="mt-16 rounded-xl border border-border bg-[var(--surface-low)] p-6 text-sm text-muted-foreground">
              Le changelog n&apos;est pas disponible pour le moment.
            </p>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
