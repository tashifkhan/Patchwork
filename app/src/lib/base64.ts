const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function base64Encode(value: string) {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(value)));
  }

  const bytes = utf8Bytes(value);
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    output += ALPHABET[a >> 2];
    output += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    output += b == null ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    output += c == null ? '=' : ALPHABET[c & 63];
  }
  return output;
}

function utf8Bytes(value: string) {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i += 1) {
    if (encoded[i] === '%') {
      bytes.push(Number.parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return bytes;
}
