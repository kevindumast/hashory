"use client";

import { createContext, ReactNode, useContext } from "react";

type ProviderDialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openDialog: () => void;
  closeDialog: () => void;
};

export const ProviderDialogContext = createContext<ProviderDialogContextValue | undefined>(undefined);

export function useProviderDialog() {
  const context = useContext(ProviderDialogContext);
  if (!context) {
    throw new Error("useProviderDialog must be used within a ProviderDialogContext provider.");
  }
  return context;
}

type ProviderDialogProviderProps = {
  value: ProviderDialogContextValue;
  children: ReactNode;
};

export function ProviderDialogProvider({ value, children }: ProviderDialogProviderProps) {
  return <ProviderDialogContext.Provider value={value}>{children}</ProviderDialogContext.Provider>;
}
