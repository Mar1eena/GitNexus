import Parser from 'tree-sitter';
import { SupportedLanguages } from 'gitnexus-shared';
// `tree-sitter-bsl` is loaded lazily through parser-loader (same pattern as C):
// a static import would crash `analyze` on installs without the native binding,
// even for repositories that contain no BSL files.
import { getLanguageGrammar } from '../../../tree-sitter/parser-loader.js';

/**
 * Scope query for 1C:Enterprise BSL (grammar: alkoleft/tree-sitter-bsl).
 *
 * BSL has one module scope per file and one function scope per
 * procedure/function — no classes, no nested functions, no imports.
 *
 * Calls: every invocation is a `method_call` node. A bare call
 * (`Метод()`) is a `method_call` on its own; a dotted call is a
 * `call_expression` whose children are an `access` receiver followed by one
 * or more `method_call`s (`Модуль.Метод()`, `Документы.Имя.Метод()`).
 * The query captures every `method_call` as a free call; `captures.ts`
 * reclassifies the dotted ones as member calls by looking at the siblings.
 */
const BSL_SCOPE_QUERY = `
;; Scopes
(source_file) @scope.module
(procedure_definition) @scope.function
(function_definition) @scope.function

;; Declarations — procedures and functions
(procedure_definition
  name: (identifier) @declaration.name) @declaration.function

(function_definition
  name: (identifier) @declaration.name) @declaration.function

;; References — calls (free/member split happens in captures.ts)
(method_call
  name: (identifier) @reference.name) @reference.call.free

;; References — procedures called by name from a string literal
;; (filtered and turned into call sites in captures.ts):
;;   Новый ОписаниеОповещения("Имя", Модуль)
(new_expression
  type: (identifier)
  arguments: (arguments
    .
    (expression (const_expression (string (string_content) @_callback.name))))) @_callback.notify

;;   ПодключитьОбработчикОжидания("Имя", Интервал)
(method_call
  name: (identifier) @_callback.attach
  arguments: (arguments
    .
    (expression (const_expression (string (string_content) @_callback.name)))))
`;

let _parser: Parser | null = null;
let _query: Parser.Query | null = null;

export function getBslParser(): Parser {
  if (_parser === null) {
    _parser = new Parser();
    _parser.setLanguage(
      getLanguageGrammar(SupportedLanguages.Bsl) as Parameters<Parser['setLanguage']>[0],
    );
  }
  return _parser;
}

export function getBslScopeQuery(): Parser.Query {
  if (_query === null) {
    _query = new Parser.Query(
      getLanguageGrammar(SupportedLanguages.Bsl) as Parameters<Parser['setLanguage']>[0],
      BSL_SCOPE_QUERY,
    );
  }
  return _query;
}
