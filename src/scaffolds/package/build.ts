import type { Problem } from '../../workspace/index.ts';
import type { ScaffoldReport } from '../scaffold.ts';
import { checkPackage } from './check.ts';
import type { Manifest, PackageFiles } from './format.ts';
import { packFiles, sha256 } from './pack.ts';
import { readPackageFolder } from './read.ts';

/** Собранный пакет: архив, его сумма и что он поставит; или что помешало. */
export type BuiltPackage =
  | {
      readonly manifest: Manifest;
      readonly files: PackageFiles;
      readonly bytes: Uint8Array;
      readonly sha256: string;
      readonly report: ScaffoldReport;
    }
  | { readonly problems: readonly Problem[] };

/**
 * Папка пакета — архивом, после той же проверки, что перед установкой. Плагины в архив попасть могут:
 * `cms new` поставит такой пакет только с `--allow-plugins`; официальным пакетам их не дают (`plugins`).
 */
export var buildPackage = (
  dir: string,
  {
    language,
    plugins,
  }: { readonly language: string; readonly plugins: boolean }
): BuiltPackage =>
  ((read) =>
    read.problems.length > 0
      ? { problems: read.problems }
      : ((check) =>
          check.problems.length > 0 ||
          check.manifest === null ||
          check.report === null
            ? { problems: check.problems }
            : ((bytes) => ({
                manifest: check.manifest!,
                files: read.files,
                bytes,
                sha256: sha256(bytes),
                report: check.report!,
              }))(packFiles(read.files)))(
          checkPackage(read.files, { language, allowPlugins: plugins })
        ))(readPackageFolder(dir));
