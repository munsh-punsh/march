import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: 'https://munsh-punsh.github.io/march/', // для GitHub Pages: https://<user>.github.io/march/
})
