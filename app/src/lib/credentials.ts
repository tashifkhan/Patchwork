// Default resolution target for `@/lib/credentials`.
//
// Metro never loads this file — it picks `.native.ts` on iOS/Android and
// `.web.ts` on web. It exists for TypeScript (which does not understand Metro's
// platform extensions) and for plain-Node consumers such as `bun test`, so it
// re-exports the web stub rather than the native module: the stub is inert and
// pulls in no react-native/expo-secure-store graph.
//
// Because TypeScript type-checks every call site against this stub, a symbol
// added to `credentials.native.ts` but not to `credentials.web.ts` now fails to
// compile instead of becoming a silent `undefined` at runtime on web.
export * from './credentials.web';
