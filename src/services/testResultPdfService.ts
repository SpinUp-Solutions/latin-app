import { auth } from '@/src/services/firebase';

export async function downloadSubmittedTestResultPdf(attemptId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to export this result');

  const token = await user.getIdToken();
  const response = await fetch(`/api/test-results/${encodeURIComponent(attemptId)}/pdf`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'Unable to export this result as a PDF');
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'test-result.pdf';
  return { blob: await response.blob(), filename };
}

export function saveBlobAsFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
