"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "hashory:privacy"

type PrivacyContextValue = {
  hidden: boolean
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyContextValue>({ hidden: false, toggle: () => {} })

/**
 * Mode discret : remplace les montants du tableau de bord par des billes
 * (utile en public ou en partage d'écran). L'état est posé sur `<html data-privacy>` pour que la
 * règle CSS de `globals.css` s'applique partout sans toucher aux composants.
 */
export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(STORAGE_KEY) === "on")
    } catch {
      /* stockage indisponible : mode visible par défaut */
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (hidden) root.dataset.privacy = "on"
    else delete root.dataset.privacy
    return () => {
      delete root.dataset.privacy
    }
  }, [hidden])

  const toggle = useCallback(() => {
    setHidden((value) => {
      const next = !value
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off")
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}

/** Bouton œil : bascule le mode discret. */
export function PrivacyToggle({ className }: { className?: string }) {
  const { hidden, toggle } = usePrivacy()
  const Icon = hidden ? EyeOff : Eye

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Afficher les montants" : "Masquer les montants"}
      title={hidden ? "Afficher les montants" : "Masquer les montants"}
      className={cn(
        "inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
        hidden && "text-foreground",
        className
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}
