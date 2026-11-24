import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// HG_ESP32=http://192.168.4.1 npm run dev  → reenvía /api a una placa real durante el desarrollo.
const esp32 = process.env.HG_ESP32;

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    manifest: true,
    rolldownOptions: {
      output: {
        // Nombres cortos: LittleFS limita la longitud de las rutas.
        entryFileNames: 'a/[hash].js',
        chunkFileNames: 'a/[hash].js',
        assetFileNames: 'a/[hash][extname]',
      },
    },
  },
  server: {
    host: true,
    proxy: esp32 ? { '/api': { target: esp32, changeOrigin: true } } : undefined,
  },
});
