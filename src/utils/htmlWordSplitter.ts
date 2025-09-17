export const splitHtmlIntoWords = (htmlContent: string): string[] => {
  if (!htmlContent || typeof window === 'undefined') {
    return [];
  }

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  // Collect all text fragments with their formatting
  const textFragments: Array<{ text: string; element: Element }> = [];
  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);

  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    if (!textNode.textContent) continue;

    const parentElement = textNode.parentNode as Element;
    textFragments.push({
      text: textNode.textContent,
      element: parentElement
    });
  }

  // Group fragments into complete words
  const words: string[] = [];
  let currentWordFragments: Array<{ text: string; element: Element }> = [];

  for (const fragment of textFragments) {
    const parts = fragment.text.split(/(\s+)/);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.trim()) {
        // Non-whitespace: add to current word
        currentWordFragments.push({ text: part, element: fragment.element });
      } else if (part && currentWordFragments.length > 0) {
        // Whitespace and we have fragments: complete the current word
        const completeWord = buildCompleteWord(currentWordFragments, tempDiv);
        if (completeWord) {
          words.push(completeWord);
        }
        currentWordFragments = [];
      }
    }
  }

  // Handle final word if no trailing whitespace
  if (currentWordFragments.length > 0) {
    const completeWord = buildCompleteWord(currentWordFragments, tempDiv);
    if (completeWord) {
      words.push(completeWord);
    }
  }

  return words;
};

function buildCompleteWord(
  fragments: Array<{ text: string; element: Element }>,
  rootElement: Element
): string {
  if (fragments.length === 0) return '';

  return fragments
    .map(fragment => createWordFragment(fragment.text, fragment.element, rootElement))
    .join('');
}

function createWordFragment(word: string, element: Element, rootElement: Element): string {
  if (element === rootElement) {
    return word;
  }

  const formatStack: string[] = [];
  let currentElement = element;

  while (currentElement && currentElement !== rootElement) {
    if (currentElement.tagName) {
      const tagName = currentElement.tagName.toLowerCase();

      // Skip block-level elements - only include inline formatting
      const blockElements = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li']);
      if (blockElements.has(tagName)) {
        currentElement = currentElement.parentNode as Element;
        continue;
      }

      const attributes = Array.from(currentElement.attributes)
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(' ');

      const openTag = attributes ? `<${tagName} ${attributes}>` : `<${tagName}>`;
      const closeTag = `</${tagName}>`;

      formatStack.unshift(openTag);
      formatStack.push(closeTag);
    }

    currentElement = currentElement.parentNode as Element;
  }

  return (
    formatStack.slice(0, formatStack.length / 2).join('') +
    word +
    formatStack.slice(formatStack.length / 2).reverse().join('')
  );
}