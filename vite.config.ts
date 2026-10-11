import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import netlify from "@netlify/vite-plugin-tanstack-start";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => ({
  server: { port: 8080 },
  plugins: [
    tsConfigPaths(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    tailwindcss(),
    mode === "netlify" ? netlify() : nitro({ preset: "node-server" }),
  ],
}));
