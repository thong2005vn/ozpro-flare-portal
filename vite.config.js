import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Thêm dòng này để Vite dùng đường dẫn tương đối
})