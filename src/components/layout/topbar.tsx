"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChatStore, useSettingsStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n/context";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { ModelSelector } from "@/components/model-selector/model-selector";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Settings as SettingsIcon,
  PanelLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const activeId = useChatStore((s) => s.activeId);
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeId),
  );
  const setConversationModel = useChatStore((s) => s.setConversationModel);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const defaultModel = useSettingsStore((s) => s.defaultModel);

  const isChat = pathname === "/" || pathname === "";
  const isSettings = pathname?.startsWith("/settings");

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-border/60">
      <div className="flex items-center gap-2 h-14 px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenu}
          className="h-9 w-9 lg:hidden shrink-0"
          aria-label={t("nav.openMenu")}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Breadcrumb / Title */}
        <nav className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            ALAQAMI
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground hidden sm:inline rtl:rotate-180" />
          <span className="text-sm font-semibold truncate">
            {isSettings ? t("settings.title") : conversation?.title || t("nav.newChat")}
          </span>
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-1">
          {isChat && (
            <ModelSelector
              value={{
                providerId:
                  conversation?.providerId || defaultProvider,
                model: conversation?.model || defaultModel,
              }}
              onChange={(providerId, model) => {
                if (activeId) {
                  setConversationModel(activeId, providerId, model);
                } else {
                  useSettingsStore
                    .getState()
                    .setDefaultProvider(providerId, model);
                }
              }}
              compact
            />
          )}
          <LanguageToggle />
          <ThemeToggle />
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={t("nav.settings")}
          >
            <Link href="/settings">
              <SettingsIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
