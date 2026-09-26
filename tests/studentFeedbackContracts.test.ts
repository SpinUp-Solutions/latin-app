import {
  feedbackFormSchema,
  submitFeedbackRequestSchema,
} from '@/shared/student-feedback';

const draftId = 'a5361411-a326-4845-8465-259154c05e14';
const attachmentId = '1be84684-3cec-4dd5-87f7-f911fdd0bc96';
const bug = { type: 'bug_report', severity: 'major', areas: ['lessons'], description: 'Audio stops' } as const;
const request = { draftId, ...bug, attachments: [], diagnostics: { entryPoint: 'standalone' } } as const;

const issuePaths = (value: unknown) => {
  const result = feedbackFormSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map(issue => issue.path.join('.'));
};

describe('feedback form contract', () => {
  it('accepts a complete report and trims text', () => {
    const parsed = feedbackFormSchema.parse({ ...bug, description: '  Audio stops  ', comments: '  ' });
    expect(parsed.description).toBe('Audio stops');
    expect(parsed.comments).toBe('');
  });

  it('requires severity only for bug reports', () => {
    expect(issuePaths({ ...bug, severity: undefined })).toEqual(['severity']);
    expect(issuePaths({ ...bug, type: 'general' })).toEqual(['severity']);
    expect(issuePaths({ ...bug, type: 'general', severity: undefined })).toEqual([]);
  });

  it('requires an explanation exactly when Other is chosen', () => {
    expect(issuePaths({ ...bug, areas: ['other'] })).toEqual(['otherAreaExplanation']);
    expect(issuePaths({ ...bug, areas: ['other'], otherAreaExplanation: 'Printing' })).toEqual([]);
    expect(issuePaths({ ...bug, otherAreaExplanation: 'Printing' })).toEqual(['otherAreaExplanation']);
  });

  it('rejects missing, blank and duplicated answers with student-facing messages', () => {
    const result = feedbackFormSchema.safeParse({ areas: [], description: '   ' });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(result.error!.issues.map(issue => [issue.path[0], issue.message]));
    expect(messages).toEqual({
      type: 'Choose what kind of feedback this is',
      areas: 'Choose at least one area',
      description: 'Please describe your feedback',
    });
    expect(issuePaths({ ...bug, areas: ['lessons', 'lessons'] })).toEqual(['areas']);
  });
});

describe('submit request contract', () => {
  it('requires a UUID draft ID and a lesson for any page', () => {
    expect(submitFeedbackRequestSchema.safeParse({ ...request, draftId: 'not-a-uuid' }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...request, pageId: 'page-1' }).success).toBe(false);
    expect(submitFeedbackRequestSchema.safeParse({ ...request, lessonId: 'lesson-1', pageId: 'page-1' }).success).toBe(true);
  });

  it('limits attachments to five unique uploads', () => {
    const attachment = { id: attachmentId, name: 'screen.png' };
    expect(submitFeedbackRequestSchema.safeParse({ ...request, attachments: [attachment, attachment] }).success).toBe(false);
    const six = Array.from({ length: 6 }, (_, index) => ({ id: `1be84684-3cec-4dd5-87f7-f911fdd0bc9${index}`, name: 'a.png' }));
    expect(submitFeedbackRequestSchema.safeParse({ ...request, attachments: six }).success).toBe(false);
  });

  it('never accepts a client-supplied submitter', () => {
    const parsed = submitFeedbackRequestSchema.parse({ ...request, submitter: { uid: 'someone-else' } });
    expect(parsed).not.toHaveProperty('submitter');
  });
});
