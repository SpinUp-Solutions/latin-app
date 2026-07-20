import {
  getContentTypeLabel,
  getContentTypeMetadata,
  isKnownContentType,
  isTestEligibleContentType,
} from '@/src/lib/content/registry';
import { createNewContent } from '@/src/utils/contentFactory';
import { ALL_CONTENT_TYPES, TEST_VERSION_CONTENT_TYPES } from '@/src/utils/contentTypeConstants';
import { getEditorTitle } from '@/src/utils/editorRegistry';

describe('content type catalog', () => {
  it.each([
    ['generated-form-identification', 'Morphology'],
    ['generated-translation', 'Definitions and Dictionary Entries'],
    ['translation-grading', 'Grade Translation'],
    ['vocabulary', 'Special Vocabulary'],
  ])('uses the author-facing label for %s', (type, label) => {
    expect(getContentTypeLabel(type)).toBe(label);
    expect(createNewContent(type).title).toBe(label);
  });

  it('uses the renamed editor titles', () => {
    expect(getEditorTitle('generated-form-identification')).toBe('Edit Morphology');
    expect(getEditorTitle('generated-translation')).toBe('Edit Definitions and Dictionary Entries');
    expect(getEditorTitle('translation-grading')).toBe('Edit Grade Translation');
    expect(getEditorTitle('vocabulary')).toBe('Edit Special Vocabulary');
  });

  it('keeps Emphasis recognized and compatible but excludes it from creation palettes', () => {
    expect(isKnownContentType('emphasis')).toBe(true);
    expect(isTestEligibleContentType('emphasis')).toBe(true);
    expect(getContentTypeMetadata('emphasis')).toMatchObject({ creatable: false });
    expect(getEditorTitle('emphasis')).toBe('Edit Emphasis Content');
    expect(ALL_CONTENT_TYPES.map(item => item.type)).not.toContain('emphasis');
    expect(TEST_VERSION_CONTENT_TYPES.map(item => item.type)).not.toContain('emphasis');
  });

  it('does not persist study mode defaults for vocabulary content', () => {
    expect(createNewContent('vocabulary')).not.toHaveProperty('studyMode');
    expect(createNewContent('vocabulary-pool')).not.toHaveProperty('studyMode');
  });
});
