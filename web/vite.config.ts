import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // O .env fica na raiz do repositório (compartilhado com o backend); o Vite
  // só expõe ao navegador as variáveis com prefixo VITE_.
  envDir: "..",
  server: {
    port: 5173,
  },
})
