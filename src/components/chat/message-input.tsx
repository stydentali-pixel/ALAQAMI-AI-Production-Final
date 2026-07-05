"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Square, Paperclip, ImageIcon, Sliders, X, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/context";
import { useChatStore, useSettingsStore } from "@/lib/store";
import type { GenerationParameters } from "@/lib/providers/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MessageInputProps {
  onSend: (content: string, opts: {
    images?: { url: string; mimeType: string }[];
    attachments?: { name: string; type: string; text: string }[];
  }) => void;
  isStreaming: boolean;
  onStop: () => void;
  parameters: GenerationParameters;
  onParametersChange: (p: GenerationParameters) => void;
  systemPrompt: string | undefined;
  onSystemPromptChange: (p: string | undefined) => void;
}

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB

export function MessageInput({
  onSend,
  isStreaming,
  onStop,
  parameters,
  onParametersChange,
  systemPrompt,
  onSystemPromptChange,
}: MessageInputProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ url: string; mimeType: string }[]>([]);
  const [attachments, setAttachments] = useState<{ name: string; type: string; text: string }[]>([]);
  const [showParams, setShowParams] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const promptLibrary = useSettingsStore((s) => s.promptLibrary);

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const newH = Math.min(textareaRef.current.scrollHeight, 240);
    textareaRef.current.style.height = newH + "px";
  }, [text]);

  const handleSend = () => {
    if (!text.trim() && images.length === 0 && attachments.length === 0) return;
    if (isStreaming) return;
    onSend(text, { images: images.length ? images : undefined, attachments: attachments.length ? attachments : undefined });
    setText("");
    setImages([]);
    setAttachments([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // On touch devices (coarse pointer), Enter on the virtual keyboard should
    // insert a newline like any other messaging app — users tap the Send
    // button to submit. Only desktop keyboards use Enter-to-send.
    const isCoarsePointer =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    if (isCoarsePointer) return;
    e.preventDefault();
    handleSend();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE) {
        toast.error(`File too large: ${file.name} (max 4MB)`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const url = await readFileAsDataURL(file);
        setImages((arr) => [...arr, { url, mimeType: file.type }]);
      } else {
        // Try to read as text
        try {
          const text = await readFileAsText(file);
          setAttachments((arr) => [
            ...arr,
            { name: file.name, type: file.type, text },
          ]);
        } catch {
          toast.error(`Could not read: ${file.name}`);
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  return (
    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1">
      <div className="max-w-3xl mx-auto">
        {/* Attachments preview */}
        {(images.length > 0 || attachments.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                { }
                <img
                  src={img.url}
                  alt={`preview-${i}`}
                  className="h-16 w-16 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => setImages((arr) => arr.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -end-1 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center opacity-90 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {attachments.map((a, i) => (
              <div
                key={`a-${i}`}
                className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs"
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{a.name}</span>
                <button
                  onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                  className="ms-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main input shell */}
        <div className="relative rounded-2xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/40 transition-all">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("chat.placeholder")}
            rows={1}
            className="min-h-[52px] max-h-[240px] resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-4 pt-3.5 pb-12 text-sm"
          />

          {/* Toolbar (absolute bottom) */}
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-2.5 py-1.5">
            <div className="flex items-center gap-0.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onFileChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.html,.css,.xml,.yaml,.yml,.toml,.ini,.sh,.bash,.zsh,.log"
                multiple
                hidden
                onChange={onFileChange}
              />
              <ToolbarBtn
                onClick={() => imageInputRef.current?.click()}
                title={t("chat.uploadImage")}
              >
                <ImageIcon className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => fileInputRef.current?.click()}
                title={t("chat.uploadFile")}
              >
                <Paperclip className="h-4 w-4" />
              </ToolbarBtn>

              <Popover open={showParams} onOpenChange={setShowParams}>
                <PopoverTrigger asChild>
                  <ToolbarBtn
                    title={t("chat.parameters")}
                    className={cn(showParams && "bg-accent")}
                  >
                    <Sliders className="h-4 w-4" />
                  </ToolbarBtn>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-4"
                  align="start"
                  sideOffset={8}
                >
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs">{t("chat.temperature")}</Label>
                        <span className="text-xs font-mono text-muted-foreground">
                          {parameters.temperature.toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        value={[parameters.temperature]}
                        min={0}
                        max={2}
                        step={0.05}
                        onValueChange={([v]) =>
                          onParametersChange({ ...parameters, temperature: v })
                        }
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs">{t("chat.topP")}</Label>
                        <span className="text-xs font-mono text-muted-foreground">
                          {parameters.topP.toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        value={[parameters.topP]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={([v]) =>
                          onParametersChange({ ...parameters, topP: v })
                        }
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs">{t("chat.maxTokens")}</Label>
                        <span className="text-xs font-mono text-muted-foreground">
                          {parameters.maxTokens}
                        </span>
                      </div>
                      <Slider
                        value={[parameters.maxTokens]}
                        min={256}
                        max={32000}
                        step={256}
                        onValueChange={([v]) =>
                          onParametersChange({ ...parameters, maxTokens: v })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1.5 block">
                        {t("chat.responseFormat")}
                      </Label>
                      <Select
                        value={parameters.responseFormat || "text"}
                        onValueChange={(v) =>
                          onParametersChange({
                            ...parameters,
                            responseFormat: v as "text" | "json",
                          })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* System prompt popover */}
              <Popover open={showPrompts} onOpenChange={setShowPrompts}>
                <PopoverTrigger asChild>
                  <ToolbarBtn
                    title={t("chat.systemPrompt")}
                    className={cn(
                      showPrompts && "bg-accent",
                      systemPrompt && "text-primary",
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </ToolbarBtn>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-3"
                  align="start"
                  sideOffset={8}
                >
                  <Label className="text-xs mb-1.5 block">
                    {t("chat.systemPrompt")}
                  </Label>
                  <Textarea
                    value={systemPrompt || ""}
                    onChange={(e) => onSystemPromptChange(e.target.value || undefined)}
                    placeholder={t("chat.systemPromptPlaceholder")}
                    rows={4}
                    className="text-xs mb-2"
                  />
                  {promptLibrary.length > 0 && (
                    <div className="border-t border-border pt-2 mt-2 space-y-1 max-h-40 overflow-y-auto">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1 pb-1">
                        {t("library.title")}
                      </div>
                      {promptLibrary.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => onSystemPromptChange(p.prompt + (systemPrompt ? "\n\n" + systemPrompt : ""))}
                          className="w-full text-start px-2 py-1.5 rounded-md hover:bg-accent text-xs flex items-center gap-1.5"
                        >
                          <Sparkles className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate">{p.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-1.5 pe-1">
              <span className="text-[10px] text-muted-foreground me-1 hidden sm:inline">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono">↵</kbd>{" "}
                send ·{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono">⇧↵</kbd>{" "}
                newline
              </span>
              {isStreaming ? (
                <Button
                  onClick={onStop}
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 rounded-xl"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  disabled={!text.trim() && images.length === 0 && attachments.length === 0}
                >
                  <Send className="h-4 w-4 rtl:-scale-x-100" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsText(file);
  });
}
