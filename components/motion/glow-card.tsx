import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlowCardProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

/**
 * Bloc interactif qui se soulève légèrement au survol (`.glow-card`).
 * Tout est en CSS : aucun suivi du pointeur, aucun state.
 */
export function GlowCard({ children, className, as: Tag = "div" }: GlowCardProps) {
  return <Tag className={cn("glow-card", className)}>{children}</Tag>;
}
