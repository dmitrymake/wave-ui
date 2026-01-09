import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import packageJson from "./package.json";

// ⚠️ Убедитесь, что IP адрес верный (IP вашей малинки)
const MOODE_TARGET = "http://192.168.1.100";

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 4567,
    proxy: {
      "/wave-api.php": {
        target: MOODE_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/wave-yandex-api.php": {
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
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
});
