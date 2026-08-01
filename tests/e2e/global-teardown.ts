export default async function globalTeardown() {
  try {
    await fetch('http://127.0.0.1:8080/shutdown', { method: 'POST' });
  } catch {
    // The Playwright web-server lifecycle may have already stopped it.
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const portsStillOpen = await Promise.all(
      ['http://127.0.0.1:8080', 'http://127.0.0.1:9099'].map(async url => {
        try {
          await fetch(url, { signal: AbortSignal.timeout(100) });
          return true;
        } catch {
          return false;
        }
      })
    );
    if (portsStillOpen.every(open => !open)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
