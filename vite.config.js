import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const MOODE_TARGET = "http://192.168.1.100";

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      // API
      "/wave-api.php": {
        target: MOODE_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/coverart.php": {
        target: MOODE_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/imagesw": {
        target: MOODE_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
