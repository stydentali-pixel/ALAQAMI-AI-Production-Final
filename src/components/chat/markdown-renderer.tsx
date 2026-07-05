"use client";

import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const inline = !className?.includes("language-") && !String(children).includes("\n");
    const code = String(children).replace(/\n$/, "");

    if (!inline && match) {
      return <CodeBlock language={match[1]} code={code} />;
    }
    if (!inline) {
      return <CodeBlock language="text" code={code} />;
    }
    return (
      <code
        className={cn(
          "px-1 py-0.5 rounded-md bg-muted text-foreground text-[0.85em] font-mono",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-4 rounded-lg border border-border">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="bg-muted/60 px-3 py-2 text-start font-semibold border-b border-border">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-3 py-2 border-b border-border/60 align-top">{children}</td>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-s-4 border-primary/40 ps-4 py-1 my-3 text-muted-foreground italic">
        {children}
      </blockquote>
    );
  },
  ul({ children }) {
    return <ul className="list-disc ps-6 my-2 space-y-1">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal ps-6 my-2 space-y-1">{children}</ol>;
  },
  h1({ children }) {
    return <h1 className="text-2xl font-bold mt-5 mb-2">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-xl font-bold mt-4 mb-2">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-lg font-semibold mt-3 mb-1.5">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="text-base font-semibold mt-3 mb-1">{children}</h4>;
  },
  p({ children }) {
    return <p className="leading-7 my-2 first:mt-0 last:mb-0">{children}</p>;
  },
  hr() {
    return <hr className="my-4 border-border" />;
  },
  img({ src, alt }) {
    return (
      <img
        src={typeof src === "string" ? src : undefined}
        alt={alt || ""}
        className="max-w-full h-auto rounded-lg border border-border my-2"
        loading="lazy"
      />
    );
  },
  li({ children }) {
    return <li className="leading-7">{children}</li>;
  },
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: {
  content: string;
}) {
  return (
    <div className="max-w-none min-w-0 break-words text-sm text-foreground">
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
});

const CodeBlock = memo(function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group relative my-3 rounded-xl overflow-hidden border border-border bg-[#0a0a0b]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-white/[0.03]">
        <span className="text-[11px] font-mono text-white/60 uppercase">
          {language}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> {t("chat.copied")}
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> {t("chat.copy")}
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          background: "transparent",
          padding: "0.875rem 1rem",
          fontSize: "0.8125rem",
          lineHeight: "1.6",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
        wrapLongLines={false}
        codeTagProps={{
          style: {
            fontFamily: "var(--font-mono), ui-monospace, monospace",
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
});
