"use client";

import { AppShell } from "@/components/layout/app-shell";
import { ChatView } from "@/components/chat/chat-view";

export default function HomePage() {
  return (
    <AppShell>
      <ChatView />
    </AppShell>
  );
}
