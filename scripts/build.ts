import { link, symlink, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compile, prepareEntry, ROOT } from './binary.ts';

// `bun run build`: один бинарник dist/cms под эту машину и рядом второе имя dist/eile, как ставит install.sh:
// символьная ссылка, а на Windows — dist/cms.exe и жёсткая ссылка dist/eile.exe, как у install.ps1
// (символьной там нужны права администратора, ADR 0049).

const EXE = process.platform === 'win32' ? '.exe' : '';
const BINARY = resolve(ROOT, `dist/cms${EXE}`);
const ALIAS = resolve(ROOT, `dist/eile${EXE}`);

const files = await prepareEntry();
await compile(BINARY);
await unlink(ALIAS).catch(() => undefined);
await (EXE ? link(BINARY, ALIAS) : symlink('cms', ALIAS));
console.log(
  `Embedded ${files} manager files into dist/cms${EXE} (also dist/eile${EXE})`
);
