/** Public target-project adapter surface. */

export {
  PROJECT_CONFIG_VERSION,
  PROJECT_CONFIG_DIR,
  PROJECT_CONFIG_FILE,
  defaultProjectConfig,
  digestConfig,
  isExternalProviderAllowed,
  loadProjectConfig,
  projectConfigPath,
  projectRuntimeBoundaryStatement,
  resolveProjectRoot,
  setupProject,
} from './config.mjs';
