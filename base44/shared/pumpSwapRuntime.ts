import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve the pinned npm package, then select its published CommonJS export.
// The upstream ESM graph imports BN as a named Anchor export and fails in Deno.
// No package source is patched and no dependency version may drift silently.
const require = createRequire(import.meta.resolve('npm:@pump-fun/pump-swap-sdk@2.1.0'));
const entry = require.resolve('@pump-fun/pump-swap-sdk');
const manifest = require(fileURLToPath(new URL('../package.json', pathToFileURL(entry))));
if (manifest.name !== '@pump-fun/pump-swap-sdk' || manifest.version !== '2.1.0') {
  throw new Error('Expected @pump-fun/pump-swap-sdk 2.1.0 in the deployed dependency graph.');
}
export default require('@pump-fun/pump-swap-sdk');
