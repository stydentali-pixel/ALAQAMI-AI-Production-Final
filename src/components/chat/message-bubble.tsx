"use client";

import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  Pencil,
  Trash2,
  AlertTriangle,
  User,
  Sparkles,
} from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useChatStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n/context";
import { getProvider } from "@/lib/providers/catalog";
import type { ChatMessage, Conversation } from "@/lib/providers/types";

interface MessageBubbleProps {
  message: ChatMessage;
  conversation: Conversation;
  isLast: boolean;
  isStreaming: boolean;
  onRegenerate: () => void;
  onEdit: (newContent: string) => void;
  onDelete: () => void;
}

export function MessageBubble({
  message,
  conversation,
  isLast,
  isStreaming,
  onRegenerate,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const updateMessage = useChatStore((s) => s.updateMessage);

  const isUser = message.role === "user";
  const isError = !!message.error;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success(t("toast.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const saveEdit = () => {
    updateMessage(conversation.id, message.id, { content: draft });
    setEditing(false);
    onEdit(draft);
  };

  if (isUser) {
    return (
      <div className="group flex gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-muted/30 transition-colors">
        <Avatar isUser />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-foreground">
              {t("chat.welcome.user")}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatTime(message.createdAt)}
            </span>
          </div>
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(8, draft.split("\n").length + 1)}
                className="bg-background text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}>
                  {t("chat.saveSubmit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(message.content);
                  }}
                >
                  {t("chat.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {message.images && message.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {message.images.map((img, i) => (
                     
                    <img
                      key={i}
                      src={img.url}
                      alt={`attachment-${i}`}
                      className="h-32 w-32 object-cover rounded-lg border border-border"
                    />
                  ))}
                </div>
              )}
              {message.attachments && message.attachments.length > 0 && (
                <div className="space-y-1 mb-2">
                  {message.attachments.map((a, i) => (
                    <div
                      key={i}
                      className="text-[11px] px-2 py-1 rounded-md bg-muted inline-block"
                    >
                      📎 {a.name}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-sm leading-7 whitespace-pre-wrap break-words">
                {message.content}
              </div>
            </>
          )}
          {!editing && (
            <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5 mt-1.5">
              <MsgBtn onClick={copy} title={t("chat.copy")}>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </MsgBtn>
              <MsgBtn
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                title={t("chat.edit")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </MsgBtn>
              <MsgBtn onClick={onDelete} title={t("chat.delete")}>
                <Trash2 className="h-3.5 w-3.5" />
              </MsgBtn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant
  const provider = message.provider ? getProvider(message.provider) : null;
  return (
    <div className="group flex gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-muted/30 transition-colors">
      <Avatar isUser={false} accent={provider?.accent} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-foreground">
            {t("chat.welcome.assistant")}
          </span>
          {provider && (
            <span className="text-[10px] text-muted-foreground">
              {provider.name}
              {message.model ? ` · ${message.model}` : ""}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
        </div>
        {isError ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive">{t("chat.error.title")}</p>
              <p className="text-muted-foreground mt-0.5 text-[13px]">
                {message.content}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-xs"
                onClick={onRegenerate}
              >
                <RefreshCw className="h-3 w-3 me-1" />
                {t("chat.error.retry")}
              </Button>
            </div>
          </div>
        ) : message.content ? (
          <MarkdownRenderer content={message.content} />
        ) : isStreaming ? (
          <ThinkingIndicator label={t("chat.thinking")} />
        ) : (
          <p className="text-sm text-muted-foreground italic">—</p>
        )}
        {isStreaming && message.content && (
          <span className="inline-block w-1.5 h-4 ms-0.5 bg-primary/70 align-text-bottom animate-pulse rounded-sm" />
        )}
        {!isStreaming && !isError && message.content && (
          <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5 mt-1.5">
            <MsgBtn onClick={copy} title={t("chat.copy")}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </MsgBtn>
            {isLast && (
              <MsgBtn onClick={onRegenerate} title={t("chat.regenerate")}>
                <RefreshCw className="h-3.5 w-3.5" />
              </MsgBtn>
            )}
            <MsgBtn onClick={onDelete} title={t("chat.delete")}>
              <Trash2 className="h-3.5 w-3.5" />
            </MsgBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ isUser, accent }: { isUser: boolean; accent?: string }) {
  if (isUser) {
    return (
      <div className="h-7 w-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
        <User className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div
      className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-white"
      style={{
        background: accent
          ? `linear-gradient(135deg, ${accent}, ${accent}cc)`
          : "var(--brand-gradient)",
      }}
    >
      <Sparkles className="h-4 w-4" />
    </div>
  );
}

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "120ms" }} />
      <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "240ms" }} />
      <span className="text-xs text-muted-foreground ms-1.5">{label}</span>
    </div>
  );
}

function MsgBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-8 w-8 sm:h-6 sm:w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background active:bg-background transition-colors"
    >
      {children}
    </button>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
