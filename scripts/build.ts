import { resolve } from 'node:path';
import { compile, prepareEntry, ROOT } from './binary.ts';

// `bun run build`: один бинарник dist/cms под эту машину.

const files = await prepareEntry();
await compile(resolve(ROOT, 'dist/cms'));
console.log(`Embedded ${files} manager files into dist/cms`);
