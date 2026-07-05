"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { useSettingsStore } from "@/lib/store";
import { getProvider } from "@/lib/providers/catalog";
import type { ProviderId } from "@/lib/providers/types";

function ThemeSync() {
  // One-way: settings store -> next-themes (so language toggle of theme works)
  // and one-way: next-themes -> settings store (so Toggle in Topbar updates store)
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const { theme: ntTheme, setTheme: setNtTheme } = useTheme();

  // On mount, push settings.theme into next-themes
  useEffect(() => {
    if (theme && theme !== ntTheme) {
      setNtTheme(theme);
    }
     
  }, []);

  // When settings.theme changes (e.g. via Settings page), push to next-themes
  useEffect(() => {
    if (theme && theme !== ntTheme) {
      setNtTheme(theme);
    }
     
  }, [theme]);

  // When next-themes changes (e.g. via Topbar toggle), push to settings store
  useEffect(() => {
    if (ntTheme && ntTheme !== theme) {
      setTheme(ntTheme as "light" | "dark" | "system");
    }
     
  }, [ntTheme]);

  return null;
}

function ServerKeySync() {
  // Detect providers that have a server-side API key (e.g. the Vercel AI
  // Gateway) so they work out of the box, and auto-select one as the default
  // when the user hasn't configured anything yet.
  const setServerKeys = useSettingsStore((s) => s.setServerKeys);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/providers/status");
        const data = await res.json();
        if (cancelled || !data?.ok || !data.serverKeys) return;
        setServerKeys(data.serverKeys);

        const state = useSettingsStore.getState();
        const hasClientKey = Object.values(state.providers || {}).some(
          (p) => p?.apiKey,
        );
        // If nothing is configured yet, default to the first server-key provider.
        if (!state.defaultProvider && !hasClientKey) {
          const firstServerProvider = (
            Object.keys(data.serverKeys) as (keyof typeof data.serverKeys)[]
          ).find((id) => data.serverKeys[id]);
          if (firstServerProvider) {
            const model = getProvider(firstServerProvider as ProviderId)
              ?.popularModels[0]?.id;
            state.setDefaultProvider(firstServerProvider as ProviderId, model);
          }
        }
      } catch {
        /* ignore — providers can still be configured manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setServerKeys]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const theme = useSettingsStore((s) => s.theme);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
      enableSystem
      disableTransitionOnChange
    >
      <ThemeSync />
      <ServerKeySync />
      <I18nProvider lang={language} setLang={setLanguage}>
        {children}
      </I18nProvider>
    </ThemeProvider>
  );
}
