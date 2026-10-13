import '../claims/register.mjs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'base44:runtime' || /^npm:@base44\/sdk@/.test(specifier))
    return { url: new URL('./runtime.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
