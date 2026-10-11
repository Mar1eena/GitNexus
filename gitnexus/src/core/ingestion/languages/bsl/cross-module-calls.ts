import type { ParsedFile, SymbolDefinition } from 'gitnexus-shared';
import type { KnowledgeGraph } from '../../../graph/types.js';
import type { GraphNodeLookup } from '../../scope-resolution/graph-bridge/node-lookup.js';
import type { ScopeResolutionIndexes } from '../../model/scope-resolution-indexes.js';
import { resolveDefGraphId } from '../../scope-resolution/graph-bridge/ids.js';
import { tryEmitEdgeWithExplicitTargetId } from '../../scope-resolution/graph-bridge/edges.js';
import {
  bslModuleIdentity,
  bslModuleKey,
  isBslFile,
  normalizeBslName,
  resolveBslReceiver,
} from './module-path.js';
import { isBslResolutionConfig } from './resolution-config.js';

const CALLABLE_TYPES: ReadonlySet<string> = new Set(['Function', 'Method']);

/**
 * Emit CALLS edges that 1C's module addressing creates without any import:
 *
 *   ОбщийМодуль.Метод()            → exported method of a common module
 *   Документы.Имя.Метод()          → exported method of a manager module
 *   ОбщийМодуль("Имя").Метод()     → BSP accessor, same as the first form
 *   ЭтотОбъект.Метод()             → method of the same module
 *   Метод()                        → exported method of a global common module,
 *                                    when the calling module does not define it
 *
 * Same-module free calls are already resolved by the generic scope chain.
 * Calls on values (`Объект.Записать()`) need type inference and are skipped.
 */
export function emitBslCrossModuleCalls(
  graph: KnowledgeGraph,
  parsedFiles: readonly ParsedFile[],
  nodeLookup: GraphNodeLookup,
  indexes: ScopeResolutionIndexes,
  resolutionConfig: unknown,
): number {
  const bslFiles = parsedFiles.filter((f) => isBslFile(f.filePath));
  if (bslFiles.length === 0) return 0;

  const moduleFiles = new Map<string, string>();
  const methodsByFile = new Map<string, Map<string, SymbolDefinition>>();
  for (const file of bslFiles) {
    const identity = bslModuleIdentity(file.filePath);
    const key = identity === null ? null : bslModuleKey(identity);
    if (key !== null) moduleFiles.set(key, file.filePath);

    const methods = new Map<string, SymbolDefinition>();
    for (const def of file.localDefs) {
      if (!CALLABLE_TYPES.has(def.type)) continue;
      const name = def.qualifiedName?.split('.').pop();
      if (name !== undefined) methods.set(normalizeBslName(name), def);
    }
    methodsByFile.set(file.filePath, methods);
  }

  const globalExports = collectGlobalExports(resolutionConfig, moduleFiles, methodsByFile);

  const seen = new Set<string>();
  let emitted = 0;
  const emit = (
    site: ParsedFile['referenceSites'][number],
    targetFile: string,
    def: SymbolDefinition,
    reason: string,
  ): void => {
    const targetId = resolveDefGraphId(targetFile, def, nodeLookup);
    if (targetId === undefined) return;
    if (
      tryEmitEdgeWithExplicitTargetId(
        graph,
        indexes,
        nodeLookup,
        site,
        targetId,
        reason,
        seen,
        0.95,
      )
    ) {
      emitted++;
    }
  };

  for (const file of bslFiles) {
    const root = bslModuleIdentity(file.filePath)?.root ?? '';
    const ownMethods = methodsByFile.get(file.filePath)!;

    for (const site of file.referenceSites) {
      if (site.kind !== 'call') continue;
      const methodName = normalizeBslName(site.name);

      if (site.callForm === 'member' && site.explicitReceiver !== undefined) {
        const target = resolveBslReceiver(site.explicitReceiver.name, root);
        if (target === null) continue;
        if (target.kind === 'self') {
          const def = ownMethods.get(methodName);
          if (def !== undefined) emit(site, file.filePath, def, 'bsl-this-object');
          continue;
        }
        const targetFile = moduleFiles.get(target.key);
        if (targetFile === undefined) continue;
        const def = methodsByFile.get(targetFile)?.get(methodName);
        if (def === undefined || def.isExported !== true) continue;
        emit(site, targetFile, def, `bsl-${target.via}-module`);
        continue;
      }

      if (site.callForm === 'free' && !ownMethods.has(methodName)) {
        const candidates = globalExports.get(methodName);
        if (candidates === undefined) continue;
        const sameRoot = candidates.filter((c) => c.root === root);
        if (sameRoot.length === 1)
          emit(site, sameRoot[0]!.file, sameRoot[0]!.def, 'bsl-global-module');
      }
    }
  }
  return emitted;
}

interface GlobalExport {
  readonly root: string;
  readonly file: string;
  readonly def: SymbolDefinition;
}

function collectGlobalExports(
  resolutionConfig: unknown,
  moduleFiles: ReadonlyMap<string, string>,
  methodsByFile: ReadonlyMap<string, ReadonlyMap<string, SymbolDefinition>>,
): Map<string, GlobalExport[]> {
  const result = new Map<string, GlobalExport[]>();
  if (!isBslResolutionConfig(resolutionConfig)) return result;
  for (const key of resolutionConfig.globalCommonModules) {
    const file = moduleFiles.get(key);
    if (file === undefined) continue;
    const root = key.slice(0, key.indexOf('|'));
    for (const [name, def] of methodsByFile.get(file) ?? []) {
      if (def.isExported !== true) continue;
      const list = result.get(name) ?? [];
      list.push({ root, file, def });
      result.set(name, list);
    }
  }
  return result;
}
