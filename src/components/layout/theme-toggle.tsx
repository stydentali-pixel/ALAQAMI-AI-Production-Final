"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { useSettingsStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const { setTheme: setNextTheme } = useTheme();
  const { t } = useI18n();

  const apply = (next: "light" | "dark" | "system") => {
    setTheme(next);
    setNextTheme(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-xl"
          aria-label={t("nav.toggleTheme")}
        >
          {theme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : theme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => apply("light")}>
          <Sun className="h-4 w-4 me-2" /> {t("settings.theme.light")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => apply("dark")}>
          <Moon className="h-4 w-4 me-2" /> {t("settings.theme.dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => apply("system")}>
          <Monitor className="h-4 w-4 me-2" /> {t("settings.theme.system")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
