import { buildTestResultPdfFilename, sanitizePdfFilenameToken } from '@/src/lib/tests/result-pdf-filename';
import { sourceTitleFromDocument, studentIdentityFromProfile } from '@/src/lib/tests/result-pdf-identity';

describe('test result PDF filename', () => {
  it('sanitizes names into lowercase ascii tokens', () => {
    expect(sanitizePdfFilenameToken('Jane Doe')).toBe('jane-doe');
    expect(sanitizePdfFilenameToken('Chapter 3: Quiz!')).toBe('chapter-3-quiz');
    expect(sanitizePdfFilenameToken('Mārcus')).toBe('marcus');
  });

  it('builds a deterministic student-test-date filename', () => {
    expect(
      buildTestResultPdfFilename({
        studentName: 'Jane Doe',
        testTitle: 'Chapter 3 Quiz',
        submittedAt: '2026-09-19T15:04:05.000Z',
      })
    ).toBe('jane-doe-chapter-3-quiz-2026-09-19.pdf');
  });

  it('falls back when student or title is empty', () => {
    expect(
      buildTestResultPdfFilename({
        studentName: '???',
        testTitle: '',
        submittedAt: 'not-a-date',
      })
    ).toBe('student-test-undated.pdf');
  });
});

describe('PDF identity and source titles', () => {
  it('uses the student first and last name when present', () => {
    expect(
      studentIdentityFromProfile({
        firstName: 'Jane',
        lastName: 'Doe',
        username: 'jdoe',
        email: 'jane@school.edu',
      })
    ).toEqual({
      name: 'Jane Doe',
      username: 'jdoe',
      email: 'jane@school.edu',
    });
  });

  it('falls back to username, then email, then Student', () => {
    expect(studentIdentityFromProfile({ username: 'jdoe' })).toMatchObject({ name: 'jdoe' });
    expect(studentIdentityFromProfile({}, 'jane@school.edu')).toEqual({
      name: 'jane',
      username: null,
      email: 'jane@school.edu',
    });
    expect(studentIdentityFromProfile(null)).toEqual({
      name: 'Student',
      username: null,
      email: null,
    });
  });

  it('falls back when a rich-text title has no visible content', () => {
    expect(
      sourceTitleFromDocument({ kind: 'normal-test', testId: 'test-1' }, { title: '<p><br>&nbsp;</p>' }).title
    ).toBe('Test');
    expect(sourceTitleFromDocument({ kind: 'mock-test', mockTestId: 'mock-1' }, { title: '<p><br></p>' }).title).toBe(
      'Mock test'
    );
  });

  it('reads test and mock titles and falls back when they are missing', () => {
    expect(sourceTitleFromDocument({ kind: 'normal-test', testId: 'test-1' }, { title: 'Chapter 3 Quiz' })).toEqual({
      kindLabel: 'Test',
      title: 'Chapter 3 Quiz',
    });
    expect(sourceTitleFromDocument({ kind: 'mock-test', mockTestId: 'mock-1' }, { title: 'Practice mock' })).toEqual({
      kindLabel: 'Mock test',
      title: 'Practice mock',
    });
    expect(sourceTitleFromDocument({ kind: 'mock-test', mockTestId: 'mock-1' }, { title: '  ' })).toEqual({
      kindLabel: 'Mock test',
      title: 'Mock test',
    });
    expect(sourceTitleFromDocument({ kind: 'normal-test', testId: 'test-1' }, undefined)).toEqual({
      kindLabel: 'Test',
      title: 'Test',
    });
  });
});
