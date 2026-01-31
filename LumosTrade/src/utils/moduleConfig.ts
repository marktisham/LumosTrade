import path from 'path';
import { ErrorHelper } from './ErrorHelper';

/**
 * Load and cache this package's config from ../../config. Sets `NODE_CONFIG_DIR` while
 * requiring `config` so module-local settings are loaded reliably.
 * If an environment-specific config file doesn't exist, the config library will fall back to default.json.
 */
let cachedConfig: any = null;
export function loadModuleConfig() {
  if (cachedConfig) return cachedConfig;
  const oldConfigDir = process.env.NODE_CONFIG_DIR;
  process.env.NODE_CONFIG_DIR = path.join(__dirname, '../../config');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const moduleConfig = require('config');
  if (oldConfigDir === undefined) {
    delete process.env.NODE_CONFIG_DIR;
  } else {
    process.env.NODE_CONFIG_DIR = oldConfigDir;
  }
  cachedConfig = moduleConfig;
  return cachedConfig;
}
