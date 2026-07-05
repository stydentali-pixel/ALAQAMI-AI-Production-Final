import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AppProviders } from "@/components/providers/app-providers";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const siteUrl = "https://alaqami.ai";

export const metadata: Metadata = {
  title: {
    default: "ALAQAMI AI — Premium AI Workspace",
    template: "%s · ALAQAMI AI",
  },
  description:
    "ALAQAMI AI is a premium multi-provider AI workspace. Chat with OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek and more — all from one elegant interface.",
  keywords: [
    "ALAQAMI",
    "AI",
    "ChatGPT",
    "Claude",
    "Gemini",
    "OpenRouter",
    "Multi-provider AI",
    "AI workspace",
  ],
  authors: [{ name: "ALAQAMI" }],
  applicationName: "ALAQAMI AI",
  icons: {
    icon: "/favicon.svg",
  },
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "ALAQAMI AI — Premium AI Workspace",
    description:
      "One elegant interface for OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek and more.",
    url: siteUrl,
    siteName: "ALAQAMI AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ALAQAMI AI",
    description: "Premium multi-provider AI workspace.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${ibmPlexArabic.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
      >
        <AppProviders>{children}</AppProviders>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
