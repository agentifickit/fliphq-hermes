// Shared YAML utilities

import fs from 'node:fs';
import * as yaml from 'js-yaml';

export function readYaml(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8')) || {};
  } catch {
    return {};
  }
}

export function writeYaml(filePath, obj) {
  fs.writeFileSync(filePath, yaml.dump(obj, { lineWidth: 120, noRefs: true }), 'utf8');
}
