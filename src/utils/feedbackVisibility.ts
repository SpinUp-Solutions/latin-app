export function hasVisibleFeedbackContent(content: unknown): boolean {
  if (typeof content === 'string') {
    return content.replace(/<[^>]*>/g, '').trim() !== '';
  }

  return Boolean(content);
}
