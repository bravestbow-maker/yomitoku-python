import { useEffect, useState } from "preact/hooks";

export function currentPath(): string {
  return location.hash.replace(/^#/, "") || "/";
}

export function go(path: string) {
  if (currentPath() === path) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  location.hash = path;
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const f = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return path;
}
