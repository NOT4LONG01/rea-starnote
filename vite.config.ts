import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 150,
      ignored: ["**/src-tauri/**", "**/node_modules/**", "**/dist/**", "**/.git/**"],
    },
  },
  // MathJax is imported in six pieces on demand (src/model/math.ts). Pre-bundled one by one as the dev server meets them, its
  // shared registry can end up in two copies ("Can't find handler for document"); bundled together up front it is one.
  // Dev server only: the app build bundles it once anyway.
  optimizeDeps: {
    include: [
      "mathjax-full/js/mathjax.js", "mathjax-full/js/input/tex.js", "mathjax-full/js/output/svg.js",
      "mathjax-full/js/adaptors/liteAdaptor.js", "mathjax-full/js/handlers/html.js", "mathjax-full/js/input/tex/AllPackages.js",
    ],
  },
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});

