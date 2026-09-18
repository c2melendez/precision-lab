/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        // Fase Z, Módulo Z0 (spec_rediseno_visual.md sección 12.2):
        // nombre visible en pantalla de inicio/instalación PWA — antes
        // decía "Calculadora Científica"/"Calculadora", nunca se había
        // sincronizado con el nombre real de la app ("Precision Lab",
        // ahora "Precision Lab Plus"). Los íconos ya eran los correctos
        // (icon-192.png/icon-512.png, activos existentes, sin cambios).
        name: "Precision Lab Plus",
        short_name: "Precision Lab",
        description: "Calculadora científica con resolución simbólica paso a paso",
        lang: "es",
        theme_color: "#1d4ed8",
        background_color: "#fbf9f4",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Plotly (gráficas) pesa ~4.8 MB minificado — supera el límite por
        // defecto de precache de Workbox (2 MB), así que se sube el tope.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // El backend (API) nunca se cachea: los cálculos deben ser siempre
        // en vivo. Solo se cachean los assets estáticos de la app (JS/CSS/
        // fuentes) para que cargue instantáneamente en visitas repetidas.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
