import { useEffect } from "preact/hooks";
import { preloadPython } from "./lib/python.ts";
import { setSoundEnabled } from "./lib/sound.ts";
import { useRoute } from "./router.ts";
import { Home } from "./screens/Home.tsx";
import { Badges, Certificate, ReadThrough, Result, Settings, Welcome, Zukan } from "./screens/Other.tsx";
import { Play } from "./screens/Play.tsx";
import { useAppState } from "./state/store.ts";
import { ConfettiHost, ConfirmHost, Toaster } from "./ui/parts.tsx";

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#12141c" : "#f6f4ef");
}

export function App() {
  const s = useAppState();
  const path = useRoute();
  useEffect(() => applyTheme(s.settings.theme), [s.settings.theme]);
  useEffect(() => setSoundEnabled(s.settings.sound), [s.settings.sound]);
  useEffect(() => {
    // 画面が出たあとで、Python の読み込みを裏で始める
    const start = () => preloadPython();
    const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 1200);
  }, []);

  let screen;
  if (!s.onboarded && path !== "/welcome") screen = <Welcome />;
  else if (path === "/play") screen = <Play />;
  else if (path === "/result") screen = <Result />;
  else if (path === "/welcome") screen = <Welcome />;
  else if (path === "/zukan") screen = <Zukan />;
  else if (path === "/badges") screen = <Badges />;
  else if (path === "/settings") screen = <Settings />;
  else if (path === "/cert") screen = <Certificate />;
  else if (path.startsWith("/readthrough/")) screen = <ReadThrough lid={path.split("/")[2]} />;
  else screen = <Home />;

  return (
    <>
      <div class="app" key={path}>{screen}</div>
      <Toaster />
      <ConfirmHost />
      <ConfettiHost />
    </>
  );
}
