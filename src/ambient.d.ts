// У рантайма скомпилированных серверных компонентов Svelte нет деклараций типов.
declare module 'svelte/internal/server';

// Точка входа клиентского рантайма Svelte; типы ей не нужны — она только реэкспортирует.
declare module 'svelte/internal/client';

// Стили и клиентские скрипты, встроенные текстом (`with { type: 'text' }`): в бинарник — строкой.
declare module '*.css' {
  const text: string;
  export default text;
}

declare module '*.client.js' {
  const text: string;
  export default text;
}
