"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import {
  changeTheme,
  getTheme,
  subscribeTheme,
} from "@/public/theme-transition.mjs";

const getServerTheme = () => "dark" as const;

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const [changing, setChanging] = useState(false);

  const label = theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";

  async function toggleTheme() {
    if (changing) return;
    setChanging(true);
    try {
      await changeTheme(theme === "dark" ? "light" : "dark");
    } finally {
      setChanging(false);
    }
  }

  return (
    <button
      type="button"
      className="theme-icon-toggle"
      data-theme={theme}
      aria-label={label}
      title={label}
      aria-busy={changing}
      disabled={changing}
      onClick={toggleTheme}
    >
      <Sun className="theme-icon-sun" size={20} aria-hidden="true" />
      <Moon className="theme-icon-moon" size={20} aria-hidden="true" />
    </button>
  );
}
