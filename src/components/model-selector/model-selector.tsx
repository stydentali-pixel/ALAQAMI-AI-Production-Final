"use client";

import { useEffect, useMemo, useState } from "react";
import { useChatStore, useSettingsStore } from "@/lib/store";
import { useI18n, useMounted } from "@/lib/i18n/context";
import { PROVIDER_CATALOG, getProvider } from "@/lib/providers/catalog";
import type { ModelDefinition, ProviderId } from "@/lib/providers/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  Search,
  Star,
  StarOff,
  Check,
  Eye,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  value: { providerId?: ProviderId; model?: string };
  onChange: (providerId: ProviderId, model: string) => void;
  /** Compact variant for the topbar (no label). */
  compact?: boolean;
}

export function ModelSelector({ value, onChange, compact }: ModelSelectorProps) {
  const { t } = useI18n();
  const mounted = useMounted();
  const providers = useSettingsStore((s) => s.providers);
  const serverKeys = useSettingsStore((s) => s.serverKeys);
  const favoriteModels = useChatStore((s) => s.favoriteModels);
  const recentModels = useChatStore((s) => s.recentModels);
  const toggleFavoriteModel = useChatStore((s) => s.toggleFavoriteModel);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fetchedModels, setFetchedModels] = useState<Map<ProviderId, ModelDefinition[]>>(new Map());

  useEffect(() => {
    const fetchAllModels = async () => {
      const newFetchedModels = new Map<ProviderId, ModelDefinition[]>();
      for (const p of PROVIDER_CATALOG) {
        const cfg = providers[p.id];
        const ready = (cfg?.apiKey && cfg?.enabled) || serverKeys[p.id];
        if (ready) {
          try {
            const res = await fetch(`/api/providers/${p.id}/models`);
            const data = await res.json();
            if (data.ok) {
              newFetchedModels.set(p.id, data.models);
            }
          } catch (e) {
            console.error(`Failed to fetch models for ${p.id}`, e);
          }
        }
      }
      setFetchedModels(newFetchedModels);
    };
    fetchAllModels();
  }, [providers, serverKeys]);

  // Build the list of models from enabled providers + custom models
  const { grouped, currentModel, currentProvider } = useMemo(() => {
    const grouped = new Map<ProviderId, ModelDefinition[]>();
    for (const p of PROVIDER_CATALOG) {
      const cfg = providers[p.id];
      // Show provider if it has an API key and is enabled, or a server key.
      const isEnabled = !!(cfg?.apiKey && cfg?.enabled) || !!serverKeys[p.id];
      if (!isEnabled) continue;
      
      const models: ModelDefinition[] = fetchedModels.get(p.id) || [...p.popularModels];
      
      // Custom models
      if (cfg?.customModels) {
        for (const id of cfg.customModels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)) {
          if (!models.find(m => m.id === id)) {
            models.push({
              id,
              name: id,
              label: id,
              provider: p.id,
              pricing: "freemium",
            });
          }
        }
      }
      grouped.set(p.id, models);
    }
    return {
      grouped,
      currentModel: value.model,
      currentProvider: value.providerId,
    };
  }, [providers, value, fetchedModels, serverKeys]);

  const currentDef = useMemo(() => {
    if (!currentProvider || !currentModel) return null;
    return (
      grouped.get(currentProvider)?.find((m) => m.id === currentModel) || null
    );
  }, [grouped, currentProvider, currentModel]);

  // Build flat filtered list for searching
  const flatFiltered = useMemo(() => {
    const all: { model: ModelDefinition; providerName: string }[] = [];
    for (const [pid, models] of grouped) {
      const providerName = getProvider(pid).name;
      for (const model of models) {
        const q = query.toLowerCase();
        if (
          !q ||
          model.id.toLowerCase().includes(q) ||
          (model.label || "").toLowerCase().includes(q) ||
          (model.description || "").toLowerCase().includes(q) ||
          providerName.toLowerCase().includes(q)
        ) {
          all.push({ model, providerName });
        }
      }
    }
    return all;
  }, [grouped, query]);

  const favorites = flatFiltered.filter((m) =>
    favoriteModels.includes(m.model.id),
  );
  const recents = flatFiltered.filter((m) =>
    recentModels.includes(m.model.id),
  );
  const byProvider = useMemo(() => {
    const map = new Map<string, { model: ModelDefinition; providerName: string }[]>();
    for (const item of flatFiltered) {
      const key = item.providerName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [flatFiltered]);

  const trigger = (
    <Button
      variant="ghost"
      role="combobox"
      aria-expanded={open}
      className={cn(
        "h-9 px-2.5 gap-1.5 font-medium text-sm justify-between",
        compact ? "max-w-[130px] sm:max-w-[240px]" : "max-w-[280px]",
      )}
    >
      {mounted && currentDef ? (
        <span className="flex items-center gap-1.5 min-w-0">
          <ProviderDot providerId={currentDef.provider} />
          <span className="truncate">
            {currentDef.label || currentDef.name}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">
          {t("chat.selectModel")}
        </span>
      )}
      <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-[min(440px,calc(100vw-2rem))] p-0"
        align="start"
        sideOffset={6}
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("model.search")}
              className="ps-8 h-9 rounded-lg text-sm bg-background"
            />
          </div>
        </div>
        <ScrollArea className="h-[min(440px,calc(100vh-12rem))]">
          <div className="p-1.5">
            {flatFiltered.length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                {t("model.noResults")}
              </div>
            )}

            {favorites.length > 0 && (
              <Group label={t("model.favorites")} icon={<Star className="h-3 w-3 text-amber-500 fill-amber-500" />}>
                {favorites.map(({ model }) => (
                  <ModelRow
                    key={`fav-${model.id}`}
                    model={model}
                    selected={model.id === currentModel && model.provider === currentProvider}
                    isFavorite
                    onPick={() => {
                      onChange(model.provider, model.id);
                      setOpen(false);
                    }}
                    onToggleFavorite={() => toggleFavoriteModel(model.id)}
                  />
                ))}
              </Group>
            )}

            {recents.length > 0 && query.length === 0 && (
              <Group label={t("model.recent")} icon={<Sparkles className="h-3 w-3 text-primary" />}>
                {recents.map(({ model }) => (
                  <ModelRow
                    key={`rec-${model.id}`}
                    model={model}
                    selected={model.id === currentModel && model.provider === currentProvider}
                    isFavorite={favoriteModels.includes(model.id)}
                    onPick={() => {
                      onChange(model.provider, model.id);
                      setOpen(false);
                    }}
                    onToggleFavorite={() => toggleFavoriteModel(model.id)}
                  />
                ))}
              </Group>
            )}

            {byProvider.map(([providerName, items]) => (
              <Group key={providerName} label={providerName}>
                {items.map(({ model }) => (
                  <ModelRow
                    key={`${model.provider}-${model.id}`}
                    model={model}
                    selected={model.id === currentModel && model.provider === currentProvider}
                    isFavorite={favoriteModels.includes(model.id)}
                    onPick={() => {
                      onChange(model.provider, model.id);
                      setOpen(false);
                    }}
                    onToggleFavorite={() => toggleFavoriteModel(model.id)}
                  />
                ))}
              </Group>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function Group({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ModelRow({
  model,
  selected,
  isFavorite,
  onPick,
  onToggleFavorite,
}: {
  model: ModelDefinition;
  selected: boolean;
  isFavorite: boolean;
  onPick: () => void;
  onToggleFavorite: () => void;
}) {
  const { t } = useI18n();
  const provider = getProvider(model.provider);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "group flex items-start gap-2.5 rounded-lg p-2 cursor-pointer transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <ProviderDot providerId={model.provider} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">
            {model.label || model.name}
          </span>
          {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">
            {provider.name}
          </span>
          {model.contextWindow && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              {(model.contextWindow / 1000).toFixed(0)}K {t("model.context")}
            </Badge>
          )}
          {model.supportsVision && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5">
              <Eye className="h-2.5 w-2.5" /> {t("model.vision")}
            </Badge>
          )}
          {model.pricing === "free" && (
            <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15">
              {t("model.free")}
            </Badge>
          )}
        </div>
        {model.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
            {model.description}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-8 w-8 sm:h-6 sm:w-6 flex items-center justify-center rounded-md hover:bg-background/80 active:bg-background/80 shrink-0"
        title={isFavorite ? t("model.removeFromFavorites") : t("model.addToFavorites")}
      >
        {isFavorite ? (
          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
        ) : (
          <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

export function ProviderDot({
  providerId,
  className,
}: {
  providerId: ProviderId;
  className?: string;
}) {
  const provider = getProvider(providerId);
  return (
    <span
      className={cn("h-2 w-2 rounded-full shrink-0", className)}
      style={{ backgroundColor: provider.accent }}
      aria-hidden
    />
  );
}
