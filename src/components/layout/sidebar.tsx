"use client";

import { useState } from "react";
import Link from "next/link";
import { useChatStore, useSettingsStore } from "@/lib/store";
import { useI18n, useMounted } from "@/lib/i18n/context";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import type { Conversation } from "@/lib/providers/types";
import {
  Plus,
  Search,
  Settings as SettingsIcon,
  Pin,
  Star,
  Trash2,
  MessageSquare,
  Library,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const setActive = useChatStore((s) => s.setActive);
  const createConversation = useChatStore((s) => s.createConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const togglePin = useChatStore((s) => s.togglePin);
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const defaultProvider = useSettingsStore((s) => s.defaultProvider);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  const { t, dir } = useI18n();
  const mounted = useMounted();
  const [query, setQuery] = useState("");

  const pinned = conversations.filter(
    (c) => c.pinned && matches(c, query),
  );
  const recent = conversations.filter(
    (c) => !c.pinned && matches(c, query),
  );

  const handleNew = () => {
    createConversation({
      providerId: defaultProvider,
      model: defaultModel,
    });
    onOpenChange(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => onOpenChange(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:sticky top-0 z-50 lg:z-auto h-dvh w-72 shrink-0",
          "flex flex-col bg-sidebar border-e border-sidebar-border",
          "transition-transform duration-300 ease-out",
          open
            ? "translate-x-0"
            : dir === "rtl"
              ? "translate-x-full lg:translate-x-0"
              : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand header */}
        <div className="px-4 pt-5 pb-3 border-b border-sidebar-border">
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            onClick={() => onOpenChange(false)}
          >
            <div className="brand-logo-bg h-9 w-9 rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none">
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
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight leading-none brand-gradient-text">
                ALAQAMI AI
              </span>
              <span className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                Premium Workspace
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden ms-auto h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* New chat + search */}
        <div className="px-3 py-3 space-y-2">
          <Button
            onClick={handleNew}
            className="w-full justify-start gap-2 h-10 rounded-xl font-semibold"
          >
            <Plus className="h-4 w-4" />
            {t("nav.newChat")}
          </Button>
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("nav.searchChats")}
              className="ps-8 h-9 bg-background/60 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1 px-2">
          {!mounted || conversations.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-xs text-muted-foreground">
                {t("nav.noConversations")}
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                {t("nav.startNew")}
              </p>
            </div>
          ) : (
            <div className="pb-4 space-y-4">
              {pinned.length > 0 && (
                <SidebarSection title={t("nav.pinned")}>
                  {pinned.map((c) => (
                    <ConversationRow
                      key={c.id}
                      conversation={c}
                      active={c.id === activeId}
                      onClick={() => {
                        setActive(c.id);
                        onOpenChange(false);
                      }}
                      onTogglePin={() => togglePin(c.id)}
                      onToggleFavorite={() => toggleFavorite(c.id)}
                      onDelete={() => deleteConversation(c.id)}
                    />
                  ))}
                </SidebarSection>
              )}
              {recent.length > 0 && (
                <SidebarSection title={t("nav.conversations")}>
                  {recent.map((c) => (
                    <ConversationRow
                      key={c.id}
                      conversation={c}
                      active={c.id === activeId}
                      onClick={() => {
                        setActive(c.id);
                        onOpenChange(false);
                      }}
                      onTogglePin={() => togglePin(c.id)}
                      onToggleFavorite={() => toggleFavorite(c.id)}
                      onDelete={() => deleteConversation(c.id)}
                    />
                  ))}
                </SidebarSection>
              )}
              {pinned.length === 0 && recent.length === 0 && (
                <div className="px-3 py-12 text-center">
                  <p className="text-xs text-muted-foreground">
                    {t("nav.noMatches", { query })}
                  </p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer nav */}
        <div className="border-t border-sidebar-border p-3 space-y-1">
          <Link
            href="/settings"
            onClick={() => onOpenChange(false)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm",
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
            )}
          >
            <SettingsIcon className="h-4 w-4" />
            {t("nav.settings")}
          </Link>
          <ActiveProvidersBadge />
        </div>
      </aside>
    </>
  );
}

export function ActiveProvidersBadge() {
  const providers = useSettingsStore((s) => s.providers);
  const mounted = useMounted();
  const { t } = useI18n();
  const enabledCount = mounted
    ? PROVIDER_CATALOG.filter((p) => providers[p.id]?.apiKey && providers[p.id]?.enabled !== false).length
    : 0;
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            enabledCount > 0 ? "bg-emerald-500 pulse-dot" : "bg-amber-500",
          )}
        />
        {t("nav.providersActive", { count: enabledCount })}
      </span>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1 w-full px-2.5 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80 hover:text-muted-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 rtl:rotate-180" />
        ) : (
          <ChevronDown className="h-3 w-3 rtl:rotate-180" />
        )}
        {title}
      </button>
      {!collapsed && <div className="space-y-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onClick,
  onTogglePin,
  onToggleFavorite,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {conversation.pinned && (
            <Pin className="h-3 w-3 text-primary shrink-0" />
          )}
          {conversation.favorite && (
            <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
          )}
          <span className="text-sm truncate font-medium">
            {conversation.title}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground block mt-0.5">
          {new Date(conversation.updatedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {conversation.messages.length > 0 && (
            <> · {conversation.messages.length} msgs</>
          )}
        </span>
      </div>
      <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5">
        <IconBtn
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={conversation.favorite ? t("nav.unfavorite") : t("nav.favorite")}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5",
              conversation.favorite
                ? "text-amber-500 fill-amber-500"
                : "text-muted-foreground",
            )}
          />
        </IconBtn>
        <IconBtn
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          title={conversation.pinned ? t("nav.unpin") : t("nav.pin")}
        >
          <Pin
            className={cn(
              "h-3.5 w-3.5",
              conversation.pinned ? "text-primary" : "text-muted-foreground",
            )}
          />
        </IconBtn>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <IconBtn
              onClick={(e) => e.stopPropagation()}
              title={t("chat.delete")}
              className="hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("nav.deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("nav.deleteConfirmDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("chat.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("chat.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 w-8 sm:h-6 sm:w-6 rounded-md flex items-center justify-center hover:bg-background/80 active:bg-background/80 transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}

function matches(c: Conversation, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (c.title.toLowerCase().includes(needle)) return true;
  return c.messages.some((m) => m.content.toLowerCase().includes(needle));
}
