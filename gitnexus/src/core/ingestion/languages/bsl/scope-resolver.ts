import type { BindingRef, Callsite, ParsedFile, SymbolDefinition } from 'gitnexus-shared';
import { SupportedLanguages } from 'gitnexus-shared';
import { populateClassOwnedMembers } from '../../scope-resolution/scope/walkers.js';
import type { ScopeResolver } from '../../scope-resolution/contract/scope-resolver.js';
import { bslProvider } from '../bsl.js';
import { emitBslCrossModuleCalls } from './cross-module-calls.js';
import { loadBslResolutionConfig } from './resolution-config.js';

/**
 * 1C:Enterprise (BSL) `ScopeResolver`.
 *
 * BSL's scope model is flat: a module scope per file and a function scope per
 * procedure/function. There are no classes, inheritance or import statements.
 * Same-module calls resolve through the generic scope chain; calls across
 * modules follow 1C's metadata addressing and are emitted by
 * `emitBslCrossModuleCalls` after the standard passes.
 */
export const bslScopeResolver: ScopeResolver = {
  language: SupportedLanguages.Bsl,
  languageProvider: bslProvider,
  importEdgeReason: 'bsl-scope: none',

  loadResolutionConfig: (repoPath: string) => loadBslResolutionConfig(repoPath),

  // BSL has no import statements.
  resolveImportTarget: () => null,

  mergeBindings: (existing, incoming) => localFirst(existing, incoming),

  arityCompatibility: (callsite, def) => bslArityCompatibility(callsite, def),

  buildMro: () => new Map(),

  populateOwners: (parsed: ParsedFile) => populateClassOwnedMembers(parsed),

  isSuperReceiver: () => false,

  fieldFallbackOnMethodLookup: false,
  propagatesReturnTypesAcrossImports: false,
  // A bare call never reaches another module by name alone, except through
  // global common modules, which `emitPostResolutionEdges` handles with the
  // metadata Global flag. The generic name-only fallback would wrongly link
  // the many same-named form handlers (`ПриСозданииНаСервере`, …) together.
  allowGlobalFreeCallFallback: false,

  emitPostResolutionEdges: (graph, parsedFiles, nodeLookup, indexes, ctx) => {
    emitBslCrossModuleCalls(graph, parsedFiles, nodeLookup, indexes, ctx.resolutionConfig);
  },
};

function localFirst(
  existing: readonly BindingRef[],
  incoming: readonly BindingRef[],
): BindingRef[] {
  const seen = new Set<string>();
  return [...existing, ...incoming]
    .sort((a, b) => (a.origin === 'local' ? 0 : 1) - (b.origin === 'local' ? 0 : 1))
    .filter((binding) => {
      if (seen.has(binding.def.nodeId)) return false;
      seen.add(binding.def.nodeId);
      return true;
    });
}

/**
 * Parameters with a default value are optional; an omitted positional argument
 * (`Ф(1, , 3)`) still occupies a position, so arity counts positions.
 */
function bslArityCompatibility(
  callsite: Callsite,
  def: SymbolDefinition,
): 'compatible' | 'unknown' | 'incompatible' {
  const max = def.parameterCount;
  const min = def.requiredParameterCount;
  if (max === undefined) return 'unknown';
  if (!Number.isFinite(callsite.arity) || callsite.arity < 0) return 'unknown';
  if (callsite.arity > max) return 'incompatible';
  if (min !== undefined && callsite.arity < min) return 'incompatible';
  return 'compatible';
}
