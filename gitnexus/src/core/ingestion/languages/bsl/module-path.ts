/**
 * Module identity for 1C:Enterprise (BSL) source files.
 *
 * 1C has no import statements: a module is addressed by the metadata object
 * that owns it. The object is encoded in the file path, in either layout:
 *
 *   EDT:         src/CommonModules/Name/Module.bsl
 *                src/Documents/Name/ManagerModule.bsl
 *                src/Documents/Name/Forms/Form/Module.bsl
 *   Designer XML dump:
 *                CommonModules/Name/Ext/Module.bsl
 *                Documents/Name/Ext/ManagerModule.bsl
 *                Documents/Name/Forms/Form/Ext/Form/Module.bsl
 *
 * Identifiers in 1C are case-insensitive, so every key built here is
 * normalized with {@link normalizeBslName}.
 */

/** Metadata-collection folders whose objects can own a manager module. */
const MANAGER_FOLDERS: ReadonlySet<string> = new Set([
  'Catalogs',
  'Documents',
  'DocumentJournals',
  'Enums',
  'Reports',
  'DataProcessors',
  'ChartsOfCharacteristicTypes',
  'ChartsOfAccounts',
  'ChartsOfCalculationTypes',
  'InformationRegisters',
  'AccumulationRegisters',
  'AccountingRegisters',
  'CalculationRegisters',
  'BusinessProcesses',
  'Tasks',
  'ExchangePlans',
  'Constants',
]);

/** Top-level folders that can own BSL modules (used to locate the config root). */
const MODULE_OWNER_FOLDERS: ReadonlySet<string> = new Set([
  ...MANAGER_FOLDERS,
  'CommonModules',
  'CommonForms',
  'CommonCommands',
  'CommandGroups',
  'WebServices',
  'HTTPServices',
  'IntegrationServices',
  'SettingsStorages',
  'Configuration',
]);

/**
 * Global-context collection name (Russian and English script variants,
 * normalized) → metadata folder. `Документы.Имя.Метод()` resolves to
 * `Documents/Имя/ManagerModule.bsl`.
 */
const COLLECTION_TO_FOLDER: ReadonlyMap<string, string> = new Map(
  (
    [
      ['Справочники', 'Catalogs', 'Catalogs'],
      ['Документы', 'Documents', 'Documents'],
      ['ЖурналыДокументов', 'DocumentJournals', 'DocumentJournals'],
      ['Перечисления', 'Enums', 'Enums'],
      ['Отчеты', 'Reports', 'Reports'],
      ['Обработки', 'DataProcessors', 'DataProcessors'],
      ['ПланыВидовХарактеристик', 'ChartsOfCharacteristicTypes', 'ChartsOfCharacteristicTypes'],
      ['ПланыСчетов', 'ChartsOfAccounts', 'ChartsOfAccounts'],
      ['ПланыВидовРасчета', 'ChartsOfCalculationTypes', 'ChartsOfCalculationTypes'],
      ['РегистрыСведений', 'InformationRegisters', 'InformationRegisters'],
      ['РегистрыНакопления', 'AccumulationRegisters', 'AccumulationRegisters'],
      ['РегистрыБухгалтерии', 'AccountingRegisters', 'AccountingRegisters'],
      ['РегистрыРасчета', 'CalculationRegisters', 'CalculationRegisters'],
      ['БизнесПроцессы', 'BusinessProcesses', 'BusinessProcesses'],
      ['Задачи', 'Tasks', 'Tasks'],
      ['ПланыОбмена', 'ExchangePlans', 'ExchangePlans'],
    ] as const
  ).flatMap(([ru, en, folder]) => [
    [normalizeBslName(ru), folder] as const,
    [normalizeBslName(en), folder] as const,
  ]),
);

/** Receivers that denote the module's own object (`ЭтотОбъект.Метод()`). */
const SELF_RECEIVERS: ReadonlySet<string> = new Set(['этотобъект', 'thisobject']);

export type BslModuleKind =
  | 'common'
  | 'manager'
  | 'object'
  | 'recordset'
  | 'valuemanager'
  | 'form'
  | 'command'
  | 'application'
  | 'other';

export interface BslModuleIdentity {
  /** Path prefix up to (excluding) the metadata folder — distinguishes configs in one repo. */
  readonly root: string;
  /** Metadata folder, e.g. `CommonModules`, `Documents`. */
  readonly folder: string;
  /** Owning metadata object name as written in the path. */
  readonly objectName: string;
  readonly kind: BslModuleKind;
}

/** 1C identifiers are case-insensitive; `ё` and `е` are interchangeable in practice. */
export function normalizeBslName(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, 'е');
}

export function isBslFile(filePath: string): boolean {
  return /\.(bsl|os)$/i.test(filePath);
}

/** Parse a BSL file path into its owning metadata object, or `null` when unknown. */
export function bslModuleIdentity(filePath: string): BslModuleIdentity | null {
  const parts = filePath.replace(/\\/g, '/').split('/');
  // Rightmost known owner folder wins, so nested repos/configs resolve to the innermost one.
  let folderIdx = -1;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (MODULE_OWNER_FOLDERS.has(parts[i]!)) {
      folderIdx = i;
      break;
    }
  }
  if (folderIdx === -1) return null;

  const folder = parts[folderIdx]!;
  const root = parts.slice(0, folderIdx).join('/');
  const rest = parts.slice(folderIdx + 1).filter((p) => p !== 'Ext');
  const fileName = rest[rest.length - 1] ?? '';

  if (folder === 'Configuration') {
    return { root, folder, objectName: '', kind: 'application' };
  }
  const objectName = rest[0] ?? '';
  if (objectName === '' || rest.length < 2) return null;

  let kind: BslModuleKind = 'other';
  if (rest.includes('Forms') || folder === 'CommonForms') kind = 'form';
  else if (rest.includes('Commands') || folder === 'CommonCommands') kind = 'command';
  else if (folder === 'CommonModules' && fileName === 'Module.bsl') kind = 'common';
  else if (fileName === 'ManagerModule.bsl') kind = 'manager';
  else if (fileName === 'ObjectModule.bsl') kind = 'object';
  else if (fileName === 'RecordSetModule.bsl') kind = 'recordset';
  else if (fileName === 'ValueManagerModule.bsl') kind = 'valuemanager';

  return { root, folder, objectName, kind };
}

/** Lookup key for a module that other modules can address by name. */
export function bslModuleKey(identity: BslModuleIdentity): string | null {
  const obj = normalizeBslName(identity.objectName);
  if (identity.kind === 'common') return `${identity.root}|common|${obj}`;
  if (identity.kind === 'manager' && MANAGER_FOLDERS.has(identity.folder)) {
    return `${identity.root}|manager|${identity.folder}|${obj}`;
  }
  return null;
}

export type BslReceiverTarget =
  | { readonly kind: 'self' }
  | { readonly kind: 'module'; readonly key: string; readonly via: 'common' | 'manager' };

/**
 * Resolve the receiver text of a member call (`ОбщийМодуль`, `Документы.Имя`,
 * `ЭтотОбъект`) to the module it addresses, relative to the caller's config root.
 * Returns `null` for receivers that are values (variables, call results), which
 * need type inference and are left to other passes.
 */
export function resolveBslReceiver(
  receiverText: string,
  callerRoot: string,
): BslReceiverTarget | null {
  const segments = receiverText
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 1) {
    const name = normalizeBslName(segments[0]!);
    if (SELF_RECEIVERS.has(name)) return { kind: 'self' };
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(segments[0]!)) return null;
    return { kind: 'module', key: `${callerRoot}|common|${name}`, via: 'common' };
  }
  if (segments.length === 2) {
    const folder = COLLECTION_TO_FOLDER.get(normalizeBslName(segments[0]!));
    if (folder === undefined) return null;
    return {
      kind: 'module',
      key: `${callerRoot}|manager|${folder}|${normalizeBslName(segments[1]!)}`,
      via: 'manager',
    };
  }
  return null;
}
