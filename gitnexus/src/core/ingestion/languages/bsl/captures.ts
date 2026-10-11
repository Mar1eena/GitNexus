import type { Capture, CaptureMatch } from 'gitnexus-shared';
import {
  nodeIfType,
  nodeToCapture,
  syntheticCapture,
  type SyntaxNode,
} from '../../utils/ast-helpers.js';
import { getBslParser, getBslScopeQuery } from './query.js';
import { getTreeSitterBufferSize } from '../../constants.js';
import { parseSourceSafe } from '../../../tree-sitter/safe-parse.js';
import { normalizeBslName } from './module-path.js';

/**
 * BSP accessor that returns a common module by name:
 * `ОбщегоНазначения.ОбщийМодуль("Имя").Метод()` calls `Имя.Метод()`.
 */
const COMMON_MODULE_ACCESSORS: ReadonlySet<string> = new Set(['общиймодуль', 'commonmodule']);

export function emitBslScopeCaptures(
  sourceText: string,
  _filePath: string,
  cachedTree?: unknown,
): readonly CaptureMatch[] {
  let tree = cachedTree as ReturnType<ReturnType<typeof getBslParser>['parse']> | undefined;
  if (tree === undefined) {
    tree = parseSourceSafe(getBslParser(), sourceText, undefined, {
      bufferSize: getTreeSitterBufferSize(sourceText),
    });
  }

  const out: CaptureMatch[] = [];
  for (const m of getBslScopeQuery().matches(tree.rootNode)) {
    const grouped: Record<string, Capture> = {};
    const nodeMap: Record<string, SyntaxNode> = {};
    for (const c of m.captures) {
      const tag = '@' + c.name;
      if (tag.startsWith('@_')) continue;
      grouped[tag] = nodeToCapture(tag, c.node);
      nodeMap[tag] = c.node;
    }
    if (Object.keys(grouped).length === 0) continue;

    const fnNode = nodeIfType(
      nodeMap['@declaration.function'],
      'procedure_definition',
      'function_definition',
    );
    if (fnNode !== null) addDeclarationMetadata(grouped, fnNode);

    const callNode = nodeIfType(nodeMap['@reference.call.free'], 'method_call');
    if (callNode !== null) classifyCall(grouped, callNode);

    out.push(grouped);
  }
  return out;
}

/** Parameter counts (defaults make a parameter optional) and the `Экспорт` flag. */
function addDeclarationMetadata(grouped: Record<string, Capture>, fnNode: SyntaxNode): void {
  const params = fnNode.childForFieldName('parameters');
  const paramNodes =
    params?.namedChildren.filter((c): c is SyntaxNode => c !== null && c.type === 'parameter') ??
    [];
  const required = paramNodes.filter((p) => p.childForFieldName('def') === null).length;
  grouped['@declaration.parameter-count'] = syntheticCapture(
    '@declaration.parameter-count',
    fnNode,
    String(paramNodes.length),
  );
  grouped['@declaration.required-parameter-count'] = syntheticCapture(
    '@declaration.required-parameter-count',
    fnNode,
    String(required),
  );
  grouped['@declaration.is-exported'] = syntheticCapture(
    '@declaration.is-exported',
    fnNode,
    String(fnNode.childForFieldName('export') !== null),
  );
}

/**
 * Split `method_call` sites into free and member calls and attach arity.
 *
 *   Метод()                                   → free
 *   Модуль.Метод()                            → member, receiver `Модуль`
 *   Документы.Имя.Метод()                     → member, receiver `Документы.Имя`
 *   ОбщегоНазначения.ОбщийМодуль("Имя").Метод() → member, receiver `Имя` (BSP accessor)
 *   Выражение().Метод()                       → member, receiver is a call result (unresolvable here)
 */
function classifyCall(grouped: Record<string, Capture>, callNode: SyntaxNode): void {
  grouped['@reference.arity'] = syntheticCapture(
    '@reference.arity',
    callNode,
    String(callArity(callNode)),
  );

  // Dotted calls put the receiver before the `method_call`, either as siblings
  // inside a `call_expression` (statement position) or inside an `access`
  // chain (`ОбщегоНазначения.ОбщийМодуль("Имя")` used as a receiver).
  const parent = callNode.parent;
  if (parent === null || (parent.type !== 'call_expression' && parent.type !== 'access')) return;
  const prev = callNode.previousNamedSibling;
  if (prev === null) return;

  // `ОбщийМодуль("Имя")` may sit directly before the call or end an access chain.
  const accessorCall = prev.type === 'access' ? prev.lastNamedChild : prev;
  const moduleName =
    accessorCall !== null && accessorCall.type === 'method_call'
      ? commonModuleAccessorTarget(accessorCall)
      : null;
  const receiver =
    moduleName !== null
      ? syntheticCapture('@reference.receiver', prev, moduleName)
      : nodeToCapture('@reference.receiver', prev);

  const anchor = grouped['@reference.call.free']!;
  delete grouped['@reference.call.free'];
  grouped['@reference.call.member'] = { ...anchor, name: '@reference.call.member' };
  grouped['@reference.receiver'] = receiver;
}

/** Positional argument count; omitted arguments (`Ф(1, , 3)`) still occupy a position. */
function callArity(callNode: SyntaxNode): number {
  const args = callNode.childForFieldName('arguments');
  if (args === null) return 0;
  let commas = 0;
  for (let i = 0; i < args.childCount; i++) {
    if (args.child(i)?.type === ',') commas++;
  }
  return commas > 0 ? commas + 1 : args.namedChildCount > 0 ? 1 : 0;
}

/** `ОбщийМодуль("Имя")` → `Имя`; anything else → null. */
function commonModuleAccessorTarget(call: SyntaxNode): string | null {
  const name = call.childForFieldName('name')?.text;
  if (name === undefined || !COMMON_MODULE_ACCESSORS.has(normalizeBslName(name))) return null;
  const args = call.childForFieldName('arguments');
  const match = args?.text.match(/^\(\s*"([\p{L}\p{N}_]+)"\s*\)$/u);
  return match?.[1] ?? null;
}
