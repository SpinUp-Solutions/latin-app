const reachable = async url => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
};

const firestoreRunning = await reachable('http://127.0.0.1:8080');
const authRunning = await reachable('http://127.0.0.1:9099');

// A forcibly interrupted Firebase CLI can leave only its Java Firestore child
// behind. Stop that known local emulator so Playwright can start the complete
// Auth + Firestore pair on the configured ports.
if (firestoreRunning && !authRunning) {
  const response = await fetch('http://127.0.0.1:8080/shutdown', { method: 'POST' });
  if (!response.ok) throw new Error(`Could not stop the stale Firestore emulator (${response.status})`);
}
