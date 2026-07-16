import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeteoTrekking — Assistente",
  description: "Mappa meteo-trekking delle Alpi occidentali con assistente AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
