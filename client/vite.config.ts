import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
<<<<<<< HEAD
    proxy: {
      '/api': 'http://localhost:4000'
    }
=======
>>>>>>> 4578f97d2abb3ae3db735ee40038b3b752a54983
  }
});
