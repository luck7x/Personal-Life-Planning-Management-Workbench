import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["mingxin-icon.svg"],
      manifest: {
        name: "明心台 2.0",
        short_name: "明心台",
        description: "手机优先的个人生活执行与复盘工具",
        theme_color: "#11141d",
        background_color: "#fbf7ef",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        icons: [
          {
            src: "mingxin-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
