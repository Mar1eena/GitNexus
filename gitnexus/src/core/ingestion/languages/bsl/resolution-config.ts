import fs from 'node:fs';
import path from 'node:path';
import { normalizeBslName } from './module-path.js';

/** Per-workspace BSL facts that live in metadata files rather than in `.bsl` sources. */
export interface BslResolutionConfig {
  /** Keys (`root|common|name`) of common modules flagged «Глобальный». */
  readonly globalCommonModules: ReadonlySet<string>;
}

const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', '.gitnexus', 'bin', 'obj']);
const MAX_DEPTH = 8;

/**
 * Find every `CommonModules` folder in the repository and collect the common
 * modules whose metadata sets the Global flag. Supports both layouts:
 *   EDT:      CommonModules/Name/Name.mdo     — `<global>true</global>`
 *   Designer: CommonModules/Name.xml          — `<Global>true</Global>`
 */
export function loadBslResolutionConfig(repoPath: string): BslResolutionConfig {
  const globalCommonModules = new Set<string>();

  const visit = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'CommonModules') {
        const root = path.relative(repoPath, dir).split(path.sep).join('/');
        for (const name of globalModulesIn(full)) {
          globalCommonModules.add(`${root}|common|${normalizeBslName(name)}`);
        }
      } else if (depth < MAX_DEPTH) {
        visit(full, depth + 1);
      }
    }
  };
  visit(repoPath, 0);

  return { globalCommonModules };
}

function globalModulesIn(commonModulesDir: string): string[] {
  const result: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(commonModulesDir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const mdo = path.join(commonModulesDir, entry.name, `${entry.name}.mdo`);
      if (fileMatches(mdo, /<global>\s*true\s*<\/global>/)) result.push(entry.name);
    } else if (entry.name.endsWith('.xml')) {
      const xml = path.join(commonModulesDir, entry.name);
      if (fileMatches(xml, /<Global>\s*true\s*<\/Global>/)) result.push(entry.name.slice(0, -4));
    }
  }
  return result;
}

function fileMatches(file: string, re: RegExp): boolean {
  try {
    return re.test(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
}

export function isBslResolutionConfig(value: unknown): value is BslResolutionConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as BslResolutionConfig).globalCommonModules instanceof Set
  );
}
