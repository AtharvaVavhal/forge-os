import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";

/**
 * Same three-family, same-weight setup as the marketing site
 * (`/Users/atharva/Forge/src/app/layout.tsx`) — Archivo at 600/700/800,
 * Source Serif 4 at 400, IBM Plex Mono at 400/500. Document B3 §27 flags
 * adding Archivo 400/500 as an open decision requiring Forge approval;
 * Phase 0 does not resolve that decision on its own, so this app loads
 * only the weights already proven on the marketing site.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FORGE Business OS",
  description: "Internal operations platform for FORGE — Phase 0 foundation.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
