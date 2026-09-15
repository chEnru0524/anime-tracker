import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Relative assets support both user pages and /repository/ project pages.
export default defineConfig({ plugins: [react()], base: "./" });
