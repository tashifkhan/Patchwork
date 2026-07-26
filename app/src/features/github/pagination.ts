export function parseGitHubNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const entry of header.split(',')) {
    const match = entry.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match?.[2] === 'next') return match[1];
  }
  return null;
}
