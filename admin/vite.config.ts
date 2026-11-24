import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The admin app — separate from the customer site (frontend/, port 5173). Same API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://localhost:8000" },
  },
});
