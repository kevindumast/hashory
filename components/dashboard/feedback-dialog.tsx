"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "convex/react";
import { Bug, Lightbulb } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, toast } from "@/lib/toast";
import { FEEDBACK_BODY_MAX, FEEDBACK_TITLE_MAX, feedbackError, type FeedbackKind } from "@/lib/feedback";
import { cn } from "@/lib/utils";

type FeedbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const KINDS = [
  { value: "bug", label: "Un bug", icon: Bug },
  { value: "idee", label: "Une idée", icon: Lightbulb },
] as const;

/** « Bug ou idée ? » : le retour devient une issue sur le dépôt GitHub du projet. */
export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const pathname = usePathname();
  const send = useMutation(api.feedback.send);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(value: boolean) {
    if (!value) {
      setKind("bug");
      setTitle("");
      setBody("");
      setError(null);
    }
    onOpenChange(value);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const input = { kind, title, body, page: pathname };
    const invalid = feedbackError(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await send({ ...input, userAgent: navigator.userAgent });
      toast.success(kind === "bug" ? "Merci, le bug est signalé !" : "Merci pour l'idée !");
      handleOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "Le retour n'a pas pu être envoyé."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="title text-2xl leading-tight">Bug ou idée ?</DialogTitle>
          <DialogDescription className="text-xs">
            Chaque retour devient une issue publique sur le dépôt GitHub du projet. Votre e-mail n&apos;y
            figure pas, mais n&apos;écrivez ni adresse de wallet ni montant que vous voulez garder pour vous.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">C&apos;est…</legend>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50",
                    kind === value
                      ? "border-primary bg-muted/30 text-foreground"
                      : "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/20"
                  )}
                >
                  <input
                    type="radio"
                    name="feedback-kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                    className="sr-only"
                  />
                  <Icon className="size-4" aria-hidden />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-title">Titre</Label>
            <Input
              id="feedback-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FEEDBACK_TITLE_MAX}
              placeholder="En une phrase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-body">Détails</Label>
            <textarea
              id="feedback-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={FEEDBACK_BODY_MAX}
              rows={6}
              placeholder={
                kind === "bug"
                  ? "Ce que vous avez fait, ce qui s'est passé, ce que vous attendiez."
                  : "Ce que vous aimeriez pouvoir faire, et pourquoi."
              }
              className="placeholder:text-muted-foreground dark:bg-input/30 border-input w-full min-w-0 resize-y rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Envoi…" : "Envoyer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
