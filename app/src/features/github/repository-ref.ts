const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

export function normalizeGitHubRepository(value: string): string {
  let candidate = value.trim();
  if (!candidate) throw new Error('Enter a repository as owner/repo or a GitHub URL.');

  if (/^https?:\/\//i.test(candidate)) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error('Enter a valid GitHub repository URL.');
    }
    if (!GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error('The repository URL must use github.com.');
    }
    if (parsed.search || parsed.hash) {
      throw new Error('Repository URLs cannot include a query or fragment.');
    }
    candidate = parsed.pathname.replace(/^\/+|\/+$/g, '');
  }

  candidate = candidate.replace(/\.git$/i, '').replace(/\/+$/g, '');
  const parts = candidate.split('/');
  if (
    parts.length !== 2 ||
    !isValidGitHubName(parts[0]) ||
    !isValidGitHubName(parts[1])
  ) {
    throw new Error('Enter a repository as owner/repo.');
  }

  return `${parts[0]}/${parts[1]}`;
}

function isValidGitHubName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 100 &&
    !value.startsWith('.') &&
    !value.endsWith('.') &&
    /^[A-Za-z0-9_.-]+$/.test(value)
  );
}
