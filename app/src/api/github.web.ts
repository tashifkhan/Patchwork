// GitHub traffic goes direct from every platform (it is CORS-friendly and the
// token stays with the client), so web runs the same client as native. Re-export
// wholesale so this file cannot drift out of sync with the native surface.
export * from './github.native';
