import path from 'node:path';
export const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
export function cliShim({ appDir, cliConfigPath, node = process.execPath, qmd }) {
  return ['#!/usr/bin/env sh', `export PATH=${shellQuote(path.dirname(node))}:"$PATH"`,
    'if [ -z "${JUMPYBRAIN_CLI_CONFIG+x}" ]; then', `  export JUMPYBRAIN_CLI_CONFIG=${shellQuote(cliConfigPath)}`, 'fi',
    ...(qmd ? ['if [ -z "${JUMPYBRAIN_QMD_BIN:-}" ]; then', `  export JUMPYBRAIN_QMD_BIN=${shellQuote(qmd)}`, 'fi'] : []),
    `exec ${shellQuote(node)} ${shellQuote(path.join(appDir, 'dist/cli.js'))} "$@"`, ''].join('\n');
}
