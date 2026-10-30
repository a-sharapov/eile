import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Менеджер — SPA внутри бинарника: без SSR, все неизвестные пути отдаются index.html.
export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ fallback: 'index.html' }),
      paths: { base: '/manager' },
    }),
  ],
  // Сервер CMS для разработки: API, медиа и ресурсы островов идут к нему.
  server: {
    // changeOrigin: false — Host остаётся адресом Vite, и проверка Origin в API видит свой сайт.
    proxy: Object.fromEntries(
      ['/manager/api', '/media', '/_cms'].map((_) => [
        _,
        {
          target: process.env.CMS_API ?? 'http://localhost:8080',
          changeOrigin: false,
        },
      ])
    ),
  },
});
