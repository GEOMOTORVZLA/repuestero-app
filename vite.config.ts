import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    /**
     * Un solo CSS de salida evita que el chunk lazy `main-app` dispare precarga de
     * `main-app-*.css` (fallo "Unable to preload CSS" en producción con import()).
     */
    cssCodeSplit: false,
  },
})
