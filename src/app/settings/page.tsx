"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n, useMounted } from "@/lib/i18n/context";
import { useSettingsStore } from "@/lib/store";
import { PROVIDER_CATALOG, getProvider } from "@/lib/providers/catalog";
import type { ProviderId, ProviderDefinition, ModelDefinition } from "@/lib/providers/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Check,
  ExternalLink,
  Loader2,
  Star,
  Sun,
  Moon,
  Monitor,
  Languages,
  Shield,
  ShieldCheck,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { t, lang } = useI18n();
  const mounted = useMounted();

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">
              {t("settings.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("settings.subtitle")}
            </p>
          </div>

          {!mounted ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : (
            <Tabs defaultValue="providers" className="w-full">
              <TabsList className="mb-6 w-full sm:w-auto overflow-x-auto flex-nowrap justify-start">
                <TabsTrigger value="providers" className="shrink-0">
                  {t("settings.providers")}
                </TabsTrigger>
                <TabsTrigger value="defaults" className="shrink-0">
                  {t("settings.defaultsTab")}
                </TabsTrigger>
                <TabsTrigger value="appearance" className="shrink-0">
                  {t("settings.appearance")}
                </TabsTrigger>
                <TabsTrigger value="library" className="shrink-0">
                  {t("nav.promptLibrary")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="providers" className="space-y-4">
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="py-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      🔒 {t("settings.providersDesc")}
                    </p>
                  </CardContent>
                </Card>
                {PROVIDER_CATALOG.map((p) => (
                  <ProviderCard key={p.id} provider={p} />
                ))}
              </TabsContent>

              <TabsContent value="defaults" className="space-y-4">
                <DefaultsCard />
              </TabsContent>

              <TabsContent value="appearance" className="space-y-4">
                <AppearanceCard />
              </TabsContent>

              <TabsContent value="library" className="space-y-4">
                <PromptLibraryCard />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ProviderCard({ provider }: { provider: ProviderDefinition }) {
  const [allModels, setAllModels] = useState<ModelDefinition[]>([]);
  useEffect(() => {
    if (!provider.id) {
      setAllModels([]);
      return;
    }
    const fetchModels = async () => {
      const res = await fetch(`/api/providers/${provider.id}/models`);
      const data = await res.json();
      if (data.ok) {
        setAllModels(data.models);
      } else {
        setAllModels([]);
      }
    };
    fetchModels();
  }, [provider.id]);
  const { t, lang } = useI18n();
  const providers = useSettingsStore((s) => s.providers);
  const serverKeys = useSettingsStore((s) => s.serverKeys);
  const setProviderConfig = useSettingsStore((s) => s.setProviderConfig);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);
  const fallbackProvider = useSettingsStore((s) => s.fallbackProvider);
  const fallbackModel = useSettingsStore((s) => s.fallbackModel);
  const setFallback = useSettingsStore((s) => s.setFallback);

  const cfg = providers[provider.id] || { enabled: false, apiKey: "" };
  const [testing, setTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const hasServerKey = !!serverKeys[provider.id];
  const isEnabled = !!(cfg.apiKey && cfg.enabled) || hasServerKey;
  const isDefault = defaultProvider === provider.id;
  const isFallback = fallbackProvider === provider.id;

  const test = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/providers/${provider.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: cfg.apiKey,
          baseUrl: cfg.baseUrl,
          model: provider.popularModels[0]?.id,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(t("toast.testSuccess"));
        setProviderConfig(provider.id, {
          lastValidatedAt: new Date().toISOString(),
        });
      } else {
        toast.error(`${t("toast.testFailed")}: ${data.error || ""}`);
      }
    } catch (e: any) {
      toast.error(`${t("toast.testFailed")}: ${e?.message || e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className={cn("overflow-hidden", !isEnabled && "opacity-90")}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${provider.accent}, ${provider.accent}dd)`,
            }}
          >
            {provider.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">
                {lang === "ar" ? provider.arabicName : provider.name}
              </CardTitle>
              {isEnabled && (
                <Badge variant="secondary" className="h-5 text-[10px] gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15">
                  <ShieldCheck className="h-3 w-3" />
                  {t("settings.enabled")}
                </Badge>
              )}
              {isDefault && (
                <Badge variant="secondary" className="h-5 text-[10px] gap-1 bg-primary/15 text-primary hover:bg-primary/15">
                  <Star className="h-3 w-3 fill-current" />
                  {t("settings.default")}
                </Badge>
              )}
              {isFallback && (
                <Badge variant="outline" className="h-5 text-[10px]">
                  {t("settings.fallback")}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-1 leading-relaxed">
              {lang === "ar" ? provider.arabicDescription : provider.description}
            </CardDescription>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) =>
              setProviderConfig(provider.id, {
                enabled: checked,
                apiKey: cfg.apiKey || "",
              })
            }
          />
        </div>
      </CardHeader>
      {(expanded || cfg.apiKey || hasServerKey) && (
        <CardContent className="pt-0 space-y-3">
          {hasServerKey && (
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>{t("settings.serverManaged")}</span>
            </div>
          )}
          <div>
            <Label className="text-xs mb-1.5 block">
              {t("settings.apiKey")}
              {hasServerKey && (
                <span className="ms-1 text-muted-foreground font-normal">
                  ({t("common.optional")})
                </span>
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={cfg.apiKey || ""}
                onChange={(e) =>
                  setProviderConfig(provider.id, { apiKey: e.target.value })
                }
                placeholder={t("settings.apiKeyPlaceholder")}
                className="h-9 font-mono text-xs"
                autoComplete="off"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={test}
                disabled={!cfg.apiKey || testing}
                className="h-9 shrink-0"
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span className="ms-1.5 hidden sm:inline">
                  {testing ? t("settings.testing") : t("settings.test")}
                </span>
              </Button>
            </div>
            {cfg.lastValidatedAt && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("settings.lastValidated")}:{" "}
                {new Date(cfg.lastValidatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {provider.id === "openai-compatible" && (
            <div>
              <Label className="text-xs mb-1.5 block">
                {t("settings.baseUrl")}
              </Label>
              <Input
                value={cfg.baseUrl || ""}
                onChange={(e) =>
                  setProviderConfig(provider.id, { baseUrl: e.target.value })
                }
                placeholder={provider.baseUrl}
                className="h-9 font-mono text-xs"
              />
            </div>
          )}

          <div>
            <Label className="text-xs mb-1.5 block">
              {t("settings.customModels")}
            </Label>
            <Input
              value={cfg.customModels || ""}
              onChange={(e) =>
                setProviderConfig(provider.id, { customModels: e.target.value })
              }
              placeholder={t("settings.customModelsPlaceholder")}
              className="h-9 font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("settings.customModelsDesc")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant={isDefault ? "default" : "outline"}
              onClick={() =>
                setDefaultProvider(
                  provider.id,
                  defaultProvider === provider.id
                    ? defaultModel
                    : allModels[0]?.id,
                )
              }
              className="h-8"
            >
              <Star className="h-3 w-3 me-1" />
              {isDefault ? t("settings.default") : t("settings.setAsDefault")}
            </Button>
            <Button
              size="sm"
              variant={isFallback ? "secondary" : "outline"}
              onClick={() =>
                setFallback(
                  isFallback ? undefined : provider.id,
                  isFallback
                    ? undefined
                    : allModels[0]?.id,
                )
              }
              className="h-8"
            >
              <Shield className="h-3 w-3 me-1" />
              {isFallback ? t("settings.fallback") : t("settings.setAsFallback")}
            </Button>
            {provider.docsUrl && (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
              >
                <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer">
                  {t("settings.viewDocs")}
                  <ExternalLink className="h-3 w-3 ms-1" />
                </a>
              </Button>
            )}
            {provider.apiKeyUrl && (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
              >
                <a
                  href={provider.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("settings.getApiKey")}
                  <ExternalLink className="h-3 w-3 ms-1" />
                </a>
              </Button>
            )}
            {cfg.apiKey && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive hover:text-destructive ms-auto"
                onClick={() => {
                  setProviderConfig(provider.id, {
                    apiKey: "",
                    enabled: false,
                  });
                  toast.success(t("settings.keyRemoved"));
                }}
              >
                <Trash2 className="h-3 w-3 me-1" />
                {t("settings.removeKey")}
              </Button>
            )}
          </div>

          {/* Model list */}
          <div className="pt-2 border-t border-border">
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 block">
              {t("settings.availableModels")}
            </Label>
            <div className="space-y-1">
              {allModels.map((m) => {
                const isCur =
                  isDefault && defaultModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setDefaultProvider(provider.id, m.id)}
                    className="w-full flex items-center justify-between text-start p-2 rounded-lg hover:bg-accent transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">
                        {m.label || m.name}
                      </div>
                      {m.description && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {lang === "ar" && m.arabicDescription
                            ? m.arabicDescription
                            : m.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.contextWindow && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                          {(m.contextWindow / 1000).toFixed(0)}K
                        </Badge>
                      )}
                      {isCur && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      )}
      {!cfg.apiKey && !expanded && !hasServerKey && (
        <CardContent className="pt-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setExpanded(true)}
          >
            {t("settings.enable")} →
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

function DefaultsCard() {
  const { t } = useI18n();
  const providers = useSettingsStore((s) => s.providers);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const setDefaultProvider = useSettingsStore((s) => s.setDefaultProvider);
  const fallbackProvider = useSettingsStore((s) => s.fallbackProvider);
  const fallbackModel = useSettingsStore((s) => s.fallbackModel);
  const setFallback = useSettingsStore((s) => s.setFallback);
  const defaultParameters = useSettingsStore((s) => s.defaultParameters);
  const setDefaultParameters = useSettingsStore((s) => s.setDefaultParameters);
  const serverKeys = useSettingsStore((s) => s.serverKeys);

    // Build available options from enabled providers (client key or server key)
    const enabledProviders = PROVIDER_CATALOG.filter(
      (p) =>
        (providers[p.id]?.apiKey && providers[p.id]?.enabled) ||
        serverKeys[p.id],
  );

    const [allModels, setAllModels] = useState<ModelDefinition[]>([]);
  useEffect(() => {
    if (!defaultProvider) {
      setAllModels([]);
      return;
    }
    const fetchModels = async () => {
      const res = await fetch(`/api/providers/${defaultProvider}/models`);
      const data = await res.json();
      if (data.ok) {
        setAllModels(data.models);
      } else {
        setAllModels([]);
      }
    };
    fetchModels();
  }, [defaultProvider]);

  const modelsForDefault = allModels;
  const modelsForFallback = fallbackProvider
    ? PROVIDER_CATALOG.find((p) => p.id === fallbackProvider)?.popularModels || []
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.defaultProvider")}</CardTitle>
          <CardDescription className="text-xs">
            {t("settings.usedForNewConvos")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">{t("settings.provider")}</Label>
            <Select
              value={defaultProvider || "none"}
              onValueChange={(v) =>
                setDefaultProvider(
                  v === "none" ? undefined : (v as ProviderId),
                  v === "none"
                    ? undefined
                    : PROVIDER_CATALOG.find((p) => p.id === v)?.popularModels[0]?.id,
                )
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("settings.noDefault")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("settings.noDefault")}</SelectItem>
                {enabledProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {modelsForDefault.length > 0 && (
            <div>
              <Label className="text-xs mb-1.5 block">
                {t("settings.defaultModel")}
              </Label>
              <Select
                value={defaultModel || "none"}
                onValueChange={(v) =>
                  setDefaultProvider(defaultProvider, v === "none" ? undefined : v)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("settings.noDefault")} />
                </SelectTrigger>
                <SelectContent>
                  {modelsForDefault.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label || m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.fallback")}</CardTitle>
          <CardDescription className="text-xs">
            {t("settings.fallbackDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block">{t("settings.provider")}</Label>
            <Select
              value={fallbackProvider || "none"}
              onValueChange={(v) =>
                setFallback(
                  v === "none" ? undefined : (v as ProviderId),
                  v === "none"
                    ? undefined
                    : PROVIDER_CATALOG.find((p) => p.id === v)?.popularModels[0]?.id,
                )
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("settings.noDefault")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("settings.noDefault")}</SelectItem>
                {enabledProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {modelsForFallback.length > 0 && (
            <div>
              <Label className="text-xs mb-1.5 block">{t("settings.model")}</Label>
              <Select
                value={fallbackModel || "none"}
                onValueChange={(v) =>
                  setFallback(
                    fallbackProvider,
                    v === "none" ? undefined : v,
                  )
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelsForFallback.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label || m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.defaultParameters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">
                {t("chat.temperature")}
              </Label>
              <Input
                type="number"
                step={0.05}
                min={0}
                max={2}
                value={defaultParameters.temperature}
                onChange={(e) =>
                  setDefaultParameters({
                    ...defaultParameters,
                    temperature: Number(e.target.value) || 0,
                  })
                }
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">{t("chat.topP")}</Label>
              <Input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={defaultParameters.topP}
                onChange={(e) =>
                  setDefaultParameters({
                    ...defaultParameters,
                    topP: Number(e.target.value) || 0,
                  })
                }
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">
                {t("chat.maxTokens")}
              </Label>
              <Input
                type="number"
                step={256}
                min={256}
                max={32000}
                value={defaultParameters.maxTokens}
                onChange={(e) =>
                  setDefaultParameters({
                    ...defaultParameters,
                    maxTokens: Number(e.target.value) || 256,
                  })
                }
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AppearanceCard() {
  const { t } = useI18n();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("settings.appearance")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs mb-2 block">{t("settings.theme")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "light", label: t("settings.theme.light"), icon: Sun },
              { value: "dark", label: t("settings.theme.dark"), icon: Moon },
              { value: "system", label: t("settings.theme.system"), icon: Monitor },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value as any)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                  theme === opt.value
                    ? "border-primary bg-accent/40"
                    : "border-border hover:border-primary/40",
                )}
              >
                <opt.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs mb-2 block">{t("settings.language")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLanguage(opt.value as any)}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all",
                  language === opt.value
                    ? "border-primary bg-accent/40"
                    : "border-border hover:border-primary/40",
                )}
              >
                <Languages className="h-4 w-4" />
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PromptLibraryCard() {
  const { t } = useI18n();
  const promptLibrary = useSettingsStore((s) => s.promptLibrary);
  const addPrompt = useSettingsStore((s) => s.addPrompt);
  const updatePrompt = useSettingsStore((s) => s.updatePrompt);
  const deletePrompt = useSettingsStore((s) => s.deletePrompt);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", prompt: "", category: "" });

  const save = () => {
    if (!draft.title.trim() || !draft.prompt.trim()) return;
    if (editingId) {
      updatePrompt(editingId, draft);
    } else {
      addPrompt(draft);
    }
    setDraft({ title: "", prompt: "", category: "" });
    setEditingId(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("library.title")}</CardTitle>
        <CardDescription className="text-xs">
          {t("library.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 p-3 rounded-lg border border-border bg-muted/30">
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={t("library.titleField")}
            className="h-8 text-sm"
          />
          <Input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            placeholder={t("library.category")}
            className="h-8 text-sm"
          />
          <textarea
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            placeholder={t("library.promptField")}
            rows={3}
            className="text-sm rounded-md border border-input bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save}>
              {editingId ? t("common.save") : t("library.add")}
            </Button>
            {editingId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setDraft({ title: "", prompt: "", category: "" });
                }}
              >
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </div>

        {promptLibrary.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">
            {t("library.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {promptLibrary.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-2 p-3 rounded-lg border border-border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {p.title}
                    </span>
                    {p.category && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                        {p.category}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {p.prompt}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 sm:h-7 sm:w-7 p-0"
                    title={t("common.edit")}
                    onClick={() => {
                      setEditingId(p.id);
                      setDraft({
                        title: p.title,
                        prompt: p.prompt,
                        category: p.category,
                      });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 sm:h-7 sm:w-7 p-0 text-destructive hover:text-destructive"
                    title={t("common.delete")}
                    onClick={() => deletePrompt(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
