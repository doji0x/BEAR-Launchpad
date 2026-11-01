import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
test('root and lockfile use the approved SDK versions', () => {
  const manifest = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
  for (const [name, version] of [['@pump-fun/pump-sdk', '4.0.0'], ['@pump-fun/pump-swap-sdk', '2.1.0']]) {
    assert.equal(manifest.dependencies[name], version); assert.equal(lock.packages[''].dependencies[name], version);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
});
test('all owned Deno Pump imports are upgraded consistently', () => {
  function walk(dir) { return readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(`${dir}/${item.name}`) : [`${dir}/${item.name}`]); }
  for (const file of walk('base44').filter(file => ['.js', '.ts'].includes(path.extname(file)))) {
    assert.doesNotMatch(read(file), /from ['"]npm:@pump-fun\/(?:pump-sdk|pump-swap-sdk)@/, `${file}: use the pinned CommonJS runtime adapter`);
    for (const match of read(file).matchAll(/npm:@pump-fun\/(pump-sdk|pump-swap-sdk)@([\d.]+)/g))
      assert.equal(match[2], match[1] === 'pump-sdk' ? '4.0.0' : '2.1.0', file);
  }
});
test('native records are admin-only and expose distinct verification and automation states', () => {
  const schema = JSON.parse(read('base44/entities/PublicLaunchAttempt.jsonc'));
  for (const field of ['nativePairPolicyVersion', 'preparedMessageBase64', 'creationSignature', 'firstBuySignature', 'quoteTokenProgram', 'lockUntil', 'policyVerified', 'automationEligible']) assert.ok(schema.properties[field], field);
  for (const operation of ['read', 'create', 'update', 'delete']) assert.equal(schema.rls[operation].user_condition.role, 'admin');
});

test('production Deno adapters choose official CommonJS exports and verify package versions', () => {
  for (const [file, name, version] of [['pumpSdkRuntime.ts', '@pump-fun/pump-sdk', '4.0.0'], ['pumpSwapRuntime.ts', '@pump-fun/pump-swap-sdk', '2.1.0']]) {
    const source = read(`base44/shared/${file}`);
    assert.ok(source.includes(`import.meta.resolve('npm:${name}@${version}')`));
    assert.ok(source.includes(`manifest.version !== '${version}'`));
    assert.ok(source.includes(`export default require('${name}')`));
  }
});
