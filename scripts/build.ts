import { symlink, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compile, prepareEntry, ROOT } from './binary.ts';

// `bun run build`: один бинарник dist/cms под эту машину и рядом второе имя — ссылка dist/eile, как ставит
// install.sh.

const ALIAS = resolve(ROOT, 'dist/eile');

const files = await prepareEntry();
await compile(resolve(ROOT, 'dist/cms'));
await unlink(ALIAS).catch(() => undefined);
await symlink('cms', ALIAS);
console.log(`Embedded ${files} manager files into dist/cms (also dist/eile)`);
