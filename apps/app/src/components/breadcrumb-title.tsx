"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Lets a detail page name itself in the topbar breadcrumb ("Videos / Spring launch") instead of "Details". */
const BreadcrumbContext = createContext<{
  title: string | null;
  setTitle: (title: string | null) => void;
}>({ title: null, setTitle: () => {} });

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <BreadcrumbContext.Provider value={{ title, setTitle }}>{children}</BreadcrumbContext.Provider>;
}

export function BreadcrumbTitle({ title }: { title: string }) {
  const { setTitle } = useContext(BreadcrumbContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
  return null;
}

export function useBreadcrumbTitle() {
  return useContext(BreadcrumbContext).title;
}
