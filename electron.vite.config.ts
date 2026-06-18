import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        external: ["electron", "sqlite3", "node-gyp-build"],
        input: {
          index: r("./src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        external: ["electron"],
        input: {
          index: r("./src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: r("./src/renderer/index.html"),
          splash: r("./src/renderer/splash.html"),
        },
      },
    },
    plugins: [tailwindcss(), svelte()],
  },
});
