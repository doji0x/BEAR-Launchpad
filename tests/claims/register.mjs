// Run Deno-authored modules against the real, locked npm packages in Node.
// The SDKs' published CommonJS exports work in Node; their upstream ESM entry
// currently imports named BN from CommonJS Anchor. Expose the real CJS exports
// as ESM bindings without replacing any SDK logic or account/transaction coder.
import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const sdks = ['@pump-fun/pump-sdk', '@pump-fun/pump-swap-sdk', '@pump-fun/agent-payments-sdk'];
// Preload the real CJS dependency graph before Node 22 links mixed ESM fixtures.
for (const name of sdks) require(name);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('npm:')) {
      specifier = specifier.replace(/^npm:(@[^/]+\/[^@/]+|[^@/]+)(?:@[^/]+)?(.*)$/, '$1$2');
      if (sdks.includes(specifier)) {
        if (/pump(?:Sdk|Swap)Runtime\.ts$/.test(context.parentURL || '')) return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true };
        return { url: `test-sdk:${specifier}`, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('test-sdk:')) {
      const name = url.slice(9), keys = Object.keys(require(name)).filter(key => /^[A-Za-z_$][\w$]*$/.test(key) && key !== 'default');
      return { format: 'module', shortCircuit: true, source: `import { createRequire } from 'node:module';\nconst sdk = createRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(name)});\nexport default sdk;\n${keys.map(key => `export const ${key} = sdk.${key};`).join('\n')}` };
    }
    return nextLoad(url, context);
  },
});
