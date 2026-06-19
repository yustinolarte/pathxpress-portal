// PATHXPRESS — Tweaks app (theme / accent / heading font)
const { useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "navy",
  "accent": "bold",
  "headingFont": "Outfit"
}/*EDITMODE-END*/;

const THEME_LABELS = { light: "Claro", dark: "Oscuro", navy: "Navy" };
const FONT_STACKS = {
  "Space Grotesk": "'Space Grotesk', system-ui, sans-serif",
  "Sora": "'Sora', system-ui, sans-serif",
  "Outfit": "'Outfit', system-ui, sans-serif"
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = t.theme;
    root.dataset.accent = t.accent;
    root.style.setProperty('--font-display', FONT_STACKS[t.headingFont] || FONT_STACKS["Space Grotesk"]);
  }, [t.theme, t.accent, t.headingFont]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Dirección de color" />
      <TweakRadio
        label="Tema"
        value={t.theme}
        options={[
          { value: "light", label: "Claro" },
          { value: "dark", label: "Oscuro" },
          { value: "navy", label: "Navy" }
        ]}
        onChange={(v) => setTweak('theme', v)}
      />
      <TweakRadio
        label="Acento rojo"
        value={t.accent}
        options={[
          { value: "subtle", label: "Sutil" },
          { value: "bold", label: "Intenso" }
        ]}
        onChange={(v) => setTweak('accent', v)}
      />
      <TweakSection label="Tipografía" />
      <TweakRadio
        label="Titulares"
        value={t.headingFont}
        options={[
          { value: "Space Grotesk", label: "Grotesk" },
          { value: "Sora", label: "Sora" },
          { value: "Outfit", label: "Outfit" }
        ]}
        onChange={(v) => setTweak('headingFont', v)}
      />
    </TweaksPanel>
  );
}

const mount = document.createElement('div');
document.body.appendChild(mount);
ReactDOM.createRoot(mount).render(<App />);
