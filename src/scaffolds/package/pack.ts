import { ZIP_EPOCH, zip } from '../../platform/zip.ts';
import type { PackageFiles } from './format.ts';

/** SHA-256 в hex — так же, как в SHA256SUMS и `--sha256`. */
export var sha256 = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

// Порядок — по кодам символов, а не localeCompare: от локали машины архив зависеть не должен.
const _byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Пакет — архивом zip, всегда одним и тем же: файлы по порядку путей, время — начало эпохи DOS, без
 * сжатия. Сумма архива зависит только от файлов: её повторит любая машина и версия zlib.
 */
export var packFiles = (files: PackageFiles): Uint8Array =>
  zip(
    [...files.keys()]
      .sort(_byPath)
      .map((name) => ({ name, data: files.get(name)! })),
    ZIP_EPOCH,
    'store'
  );
