export { emitBslScopeCaptures } from './captures.js';
export {
  bslModuleIdentity,
  bslModuleKey,
  isBslFile,
  normalizeBslName,
  resolveBslReceiver,
  type BslModuleIdentity,
  type BslModuleKind,
} from './module-path.js';
export { loadBslResolutionConfig, type BslResolutionConfig } from './resolution-config.js';
export { emitBslCrossModuleCalls } from './cross-module-calls.js';
