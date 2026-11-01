export const secrets = { get: name => globalThis.nativeTest.secrets[name] };
export const createClientFromRequest = () => globalThis.nativeTest.client;
