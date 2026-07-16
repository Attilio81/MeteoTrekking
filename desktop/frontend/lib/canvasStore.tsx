"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

export type CanvasView = { tool: string; data: any } | null;

const Ctx = createContext<{
  view: CanvasView;
  show: (tool: string, data: any) => void;
  clear: () => void;
}>({ view: null, show: () => {}, clear: () => {} });

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<CanvasView>(null);
  // stabili: evitano loop di render quando usati come dep negli effetti dei consumer
  const show = useCallback((tool: string, data: any) => setView({ tool, data }), []);
  const clear = useCallback(() => setView(null), []);
  const value = useMemo(() => ({ view, show, clear }), [view, show, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCanvas = () => useContext(Ctx);
