/**
 * 1C:Enterprise (BSL) Language Provider.
 *
 * Grammar: `tree-sitter-bsl` (alkoleft/tree-sitter-bsl), Russian and English
 * keyword variants. Procedures and functions become Function nodes; the
 * `Экспорт` keyword marks a definition as exported.
 *
 * Cross-module calls (common modules, manager modules, global modules) are
 * resolved by `bslScopeResolver.emitPostResolutionEdges`, because 1C addresses
 * modules through metadata objects instead of import statements.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';
import type { ExportChecker } from '../export-detection.js';
import { BSL_QUERIES } from '../tree-sitter-queries.js';
import { emitBslScopeCaptures } from './bsl/index.js';

const DEFINITION_TYPES: ReadonlySet<string> = new Set([
  'procedure_definition',
  'function_definition',
]);

/** A procedure/function is exported when its declaration carries `Экспорт` / `Export`. */
const bslExportChecker: ExportChecker = (node) => {
  for (let current: typeof node | null = node; current !== null; current = current.parent) {
    if (DEFINITION_TYPES.has(current.type)) return current.childForFieldName('export') !== null;
  }
  return false;
};

/** Event handlers of objects and forms that the platform calls directly. */
const BSL_ENTRY_POINTS: readonly RegExp[] = [
  /^ОбработкаПроведения$/,
  /^ПередЗаписью$/,
  /^ПриЗаписи$/,
  /^ОбработкаЗаполнения$/,
  /^ОбработкаПроверкиЗаполнения$/,
  /^ПриСозданииНаСервере$/,
  /^ПриОткрытии$/,
  /^ОбработкаКоманды$/,
  /^ОбработкаПолученияДанныхВыбора$/,
  /^ПриНачалеРаботыСистемы$/,
  /^Posting$/,
  /^BeforeWrite$/,
  /^OnWrite$/,
  /^OnCreateAtServer$/,
  /^OnOpen$/,
  /^CommandProcessing$/,
];

export const bslProvider = defineLanguage({
  id: SupportedLanguages.Bsl,
  extensions: ['.bsl', '.os'],
  entryPointPatterns: BSL_ENTRY_POINTS,
  treeSitterQueries: BSL_QUERIES,
  typeConfig: {
    declarationNodeTypes: new Set(),
    extractDeclaration: () => null,
    extractParameter: () => null,
  },
  exportChecker: bslExportChecker,
  // 1C has no import statements; modules are addressed through metadata.
  importResolver: () => null,

  emitScopeCaptures: emitBslScopeCaptures,
  // No imports, so interpretImport never sees a capture.
  interpretImport: () => null,
});
