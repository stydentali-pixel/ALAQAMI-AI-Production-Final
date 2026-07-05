"use client";

import { Sparkles, Code2, Mail, Lightbulb, BookOpen, Key } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { useSettingsStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onPick: (s: string) => void;
  disabled?: boolean;
}

export function EmptyState({ onPick, disabled }: EmptyStateProps) {
  const { t } = useI18n();
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const providers = useSettingsStore((s) => s.providers);
  const hasKey = defaultProvider ? !!providers[defaultProvider]?.apiKey : false;

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
      <div className="text-center mb-8">
        <div className="brand-logo-bg h-14 w-14 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none">
            <path
              d="M6 18L12 5L18 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.5 14H15.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t("chat.empty.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          {t("chat.empty.subtitle")}
        </p>
      </div>

      {!hasKey && (
        <div className="mb-6 max-w-md w-full p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <Key className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {t("errors.noApiKey")}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs">
                <Link href="/settings">{t("nav.settings")}</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl">
        <SuggestionCard
          icon={<BookOpen className="h-4 w-4" />}
          label={t("chat.empty.cta1")}
          prompt="Explain quantum entanglement in simple terms, using a real-world analogy."
          onPick={onPick}
          disabled={disabled}
        />
        <SuggestionCard
          icon={<Code2 className="h-4 w-4" />}
          label={t("chat.empty.cta2")}
          prompt="Write a TypeScript function that debounces an async function with cancellation."
          onPick={onPick}
          disabled={disabled}
        />
        <SuggestionCard
          icon={<Mail className="h-4 w-4" />}
          label={t("chat.empty.cta3")}
          prompt="Draft a friendly but professional email asking my team for a project status update."
          onPick={onPick}
          disabled={disabled}
        />
        <SuggestionCard
          icon={<Lightbulb className="h-4 w-4" />}
          label={t("chat.empty.cta4")}
          prompt="Brainstorm 5 original product ideas that combine AI with everyday household objects."
          onPick={onPick}
          disabled={disabled}
        />
      </div>

      <div className="mt-8 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        ALAQAMI AI · Premium multi-provider workspace
      </div>
    </div>
  );
}

function SuggestionCard({
  icon,
  label,
  prompt,
  onPick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  prompt: string;
  onPick: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onPick(prompt)}
      disabled={disabled}
      className="group text-start p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="h-7 w-7 rounded-lg bg-accent text-accent-foreground flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {icon}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2">{prompt}</p>
    </button>
  );
}
