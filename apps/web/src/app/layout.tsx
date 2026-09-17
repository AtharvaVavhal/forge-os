import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";

/**
 * Archivo 400/500 are required for interface body, helper, and error text
 * (Document 2 §4). Phase 0 left the addition flagged; auth forms cannot
 * ship at 600-only without breaking the type-role rules, so the weights
 * Document 2 names are loaded here.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
  description: "Internal operations platform for FORGE.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-display">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
