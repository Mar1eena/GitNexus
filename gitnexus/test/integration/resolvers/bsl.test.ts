/**
 * 1C:Enterprise BSL: procedures/functions, `Экспорт`, and cross-module calls
 * addressed through metadata (common, manager and global modules).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  edgeSet,
  FIXTURES,
  getNodesByLabel,
  getRelationships,
  runPipelineFromRepo,
  type PipelineResult,
} from './helpers.js';
import { SupportedLanguages } from '../../../src/config/supported-languages.js';
import { describeGrammarPresence, optionalGrammarGate } from '../../helpers/optional-grammar.js';

// npm `tree-sitter-bsl` is optional: without its native binding the pipeline
// skips `.bsl` files by contract, so the suite skips too.
const bsl = optionalGrammarGate(SupportedLanguages.Bsl);

describeGrammarPresence(bsl);

describe.skipIf(!bsl.available)('BSL basic resolution', () => {
  let result: PipelineResult;
  let calls: string[];

  beforeAll(async () => {
    result = await runPipelineFromRepo(path.join(FIXTURES, 'bsl-basic'), () => {});
    calls = edgeSet(getRelationships(result, 'CALLS'));
  }, 60000);

  it('extracts procedures and functions as Function nodes', () => {
    const fns = getNodesByLabel(result, 'Function');
    expect(fns).toEqual(
      expect.arrayContaining([
        'УровеньРиска',
        'ВнутреннийРасчет',
        'ПроверитьКартотеку',
        'ОбработкаПроведения',
        'ПриСозданииНаСервере',
      ]),
    );
  });

  it('resolves calls inside one module', () => {
    expect(calls).toContain('УровеньРиска → ВнутреннийРасчет');
    expect(calls).toContain('ПриСозданииНаСервере → ОбновитьРиск');
  });

  it('resolves ОбщийМодуль.Метод() to the exported method of the common module', () => {
    expect(calls).toContain('ПроверитьКартотеку → УровеньРиска');
  });

  it('matches method names case-insensitively', () => {
    // The form calls `РаботаСКлиентами.уровеньриска(...)`.
    expect(calls).toContain('ОбновитьРиск → УровеньРиска');
  });

  it('resolves Документы.Имя.Метод() to the manager module', () => {
    expect(calls).toContain('ОбработкаПроведения → ПроверитьКартотеку');
  });

  it('does not link to a manager method without Экспорт', () => {
    expect(calls).not.toContain('ОбработкаПроведения → НеЭкспортная');
  });

  it('resolves the BSP accessor ОбщийМодуль("Имя").Метод()', () => {
    expect(calls).toContain('ЗаполнитьДвижения → УровеньРиска');
  });

  it('resolves ЭтотОбъект.Метод() to the same module', () => {
    expect(calls).toContain('ОбработкаПроведения → ЗаполнитьДвижения');
  });

  it('resolves bare calls to exported methods of global common modules', () => {
    expect(calls).toContain('ОбработкаПроведения → СообщитьОбОшибке');
  });

  it('does not expose non-exported methods of a common module', () => {
    const fromOtherModules = getRelationships(result, 'CALLS').filter(
      (e) => e.target === 'ВнутреннийРасчет' && !e.sourceFilePath.includes('РаботаСКлиентами'),
    );
    expect(fromOtherModules).toEqual([]);
  });
});
