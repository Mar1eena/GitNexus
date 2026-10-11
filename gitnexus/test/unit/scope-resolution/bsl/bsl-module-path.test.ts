/**
 * Unit tests for 1C module identity and receiver resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  bslModuleIdentity,
  bslModuleKey,
  normalizeBslName,
  resolveBslReceiver,
} from '../../../../src/core/ingestion/languages/bsl/module-path.js';

describe('bslModuleIdentity', () => {
  it('reads EDT layout', () => {
    expect(bslModuleIdentity('ias/src/CommonModules/АБС_ФЭССервер/Module.bsl')).toEqual({
      root: 'ias/src',
      folder: 'CommonModules',
      objectName: 'АБС_ФЭССервер',
      kind: 'common',
    });
    expect(bslModuleIdentity('src/Documents/Док/ManagerModule.bsl')?.kind).toBe('manager');
    expect(bslModuleIdentity('src/Documents/Док/ObjectModule.bsl')?.kind).toBe('object');
    expect(bslModuleIdentity('src/InformationRegisters/Рег/RecordSetModule.bsl')?.kind).toBe(
      'recordset',
    );
    expect(bslModuleIdentity('src/Documents/Док/Forms/ФормаДокумента/Module.bsl')?.kind).toBe(
      'form',
    );
    expect(bslModuleIdentity('src/Documents/Док/Commands/Печать/CommandModule.bsl')?.kind).toBe(
      'command',
    );
  });

  it('reads Designer XML dump layout (Ext folders)', () => {
    expect(bslModuleIdentity('cf/CommonModules/Общий/Ext/Module.bsl')).toEqual({
      root: 'cf',
      folder: 'CommonModules',
      objectName: 'Общий',
      kind: 'common',
    });
    expect(bslModuleIdentity('cf/Catalogs/Спр/Ext/ManagerModule.bsl')?.kind).toBe('manager');
    expect(bslModuleIdentity('cf/Catalogs/Спр/Forms/Форма/Ext/Form/Module.bsl')?.kind).toBe('form');
  });

  it('returns null outside a configuration layout', () => {
    expect(bslModuleIdentity('scripts/build.os')).toBeNull();
  });
});

describe('bslModuleKey', () => {
  it('keys common and manager modules case-insensitively', () => {
    const common = bslModuleIdentity('src/CommonModules/РаботаСКлиентами/Module.bsl')!;
    expect(bslModuleKey(common)).toBe('src|common|работасклиентами');
    const manager = bslModuleIdentity('src/Documents/ПлатежноеПоручение/ManagerModule.bsl')!;
    expect(bslModuleKey(manager)).toBe('src|manager|Documents|платежноепоручение');
  });

  it('gives forms and object modules no addressable key', () => {
    expect(bslModuleKey(bslModuleIdentity('src/Documents/Д/ObjectModule.bsl')!)).toBeNull();
    expect(bslModuleKey(bslModuleIdentity('src/Documents/Д/Forms/Ф/Module.bsl')!)).toBeNull();
  });
});

describe('resolveBslReceiver', () => {
  it('resolves a common-module receiver', () => {
    expect(resolveBslReceiver('РаботаСКлиентами', 'src')).toEqual({
      kind: 'module',
      key: 'src|common|работасклиентами',
      via: 'common',
    });
  });

  it('resolves Russian and English manager collections', () => {
    expect(resolveBslReceiver('Документы.Док', 'src')).toMatchObject({
      key: 'src|manager|Documents|док',
      via: 'manager',
    });
    expect(resolveBslReceiver('InformationRegisters.Рег', 'src')).toMatchObject({
      key: 'src|manager|InformationRegisters|рег',
    });
    expect(resolveBslReceiver('РегистрыСведений.АБС_УровниРискаПоКО', '')).toMatchObject({
      key: '|manager|InformationRegisters|абс_уровнирискапоко',
    });
  });

  it('recognizes ЭтотОбъект / ThisObject', () => {
    expect(resolveBslReceiver('ЭтотОбъект', 'src')).toEqual({ kind: 'self' });
    expect(resolveBslReceiver('ThisObject', 'src')).toEqual({ kind: 'self' });
  });

  it('rejects value receivers', () => {
    expect(resolveBslReceiver('Справочники.Спр.НайтиПоКоду("1")', 'src')).toBeNull();
    expect(resolveBslReceiver('Объект.Реквизит.Поле', 'src')).toBeNull();
    expect(resolveBslReceiver('Неизвестное.Имя', 'src')).toBeNull();
  });
});

describe('normalizeBslName', () => {
  it('lowercases and folds ё', () => {
    expect(normalizeBslName('Отчёты')).toBe(normalizeBslName('ОТЧЕТЫ'));
  });
});
