import React, { createContext, useContext, useEffect, useRef, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
  storageKey?: string;
  targetRef?: React.RefObject<HTMLElement | null>;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
  storageKey = "theme",
  targetRef,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem(storageKey);
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const el = targetRef?.current ?? document.documentElement;
    const isScoped = !!targetRef?.current;

    if (isScoped) {
      // Scoped portal: manages both the portal div and document.documentElement
      // so Radix portals (appended to body, outside the portal div) also get the right theme.
      if (theme === "dark") {
        el.classList.add("dark");
        el.classList.remove("light");
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
      } else {
        el.classList.remove("dark");
        el.classList.add("light");
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      }
    } else {
      // Global provider: manages document.documentElement, but yields to scoped portal if active
      if (theme === "dark" && !document.documentElement.classList.contains("light")) {
        el.classList.add("dark");
      } else if (theme !== "dark") {
        el.classList.remove("dark");
      }
    }

    if (switchable) {
      localStorage.setItem(storageKey, theme);
    }

    return () => {
      if (isScoped) {
        // On unmount, restore html to dark (global ThemeProvider won't re-run its effect)
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
      }
    };
  }, [theme, switchable, storageKey, targetRef]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
