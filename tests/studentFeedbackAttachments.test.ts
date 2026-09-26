jest.mock('@/src/services/firebase-admin', () => ({ adminStorage: {} }));

import {
  deleteFeedbackUploads,
  feedbackReportAttachmentPath,
  getFeedbackAttachmentLinks,
  matchesFeedbackMediaSignature,
  storeFeedbackAttachments,
} from '@/src/lib/student-feedback/attachments.server';
import type { FeedbackReport } from '@/shared/student-feedback';

const draftId = '08814ab5-2712-49e9-9c54-7c7317fdd812';
const imageId = '1be84684-3cec-4dd5-87f7-f911fdd0bc96';
const videoId = '2be84684-3cec-4dd5-87f7-f911fdd0bc96';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, ...Buffer.from('ftypmp42')]);
const HTML = Uint8Array.from(Buffer.from('<html><script>alert(1)</script>'));

interface StoredObject {
  contentType: string;
  size: number;
  generation: string;
  head: Uint8Array;
}

function fakeBucket(objects: Record<string, StoredObject>) {
  const copies: Array<{ from: string; generation?: string; to: string; options: unknown }> = [];
  const deleted: string[] = [];
  const signed: Array<{ path: string; options: Record<string, unknown> }> = [];
  const bucket = {
    file: (path: string, options?: { generation?: string }) => ({
      getMetadata: async () => {
        const object = objects[path];
        if (!object) throw Object.assign(new Error('No such object'), { code: 404 });
        return [{ contentType: object.contentType, size: String(object.size), generation: object.generation }];
      },
      download: async () => {
        if (objects[path]?.generation !== options?.generation) throw new Error('Unpinned download');
        return [Buffer.from(objects[path].head)];
      },
      copy: async (destination: { path: string }, copyOptions: unknown) => {
        copies.push({ from: path, generation: options?.generation, to: destination.path, options: copyOptions });
      },
      delete: async () => {
        deleted.push(path);
      },
      getSignedUrl: async (signOptions: Record<string, unknown>) => {
        signed.push({ path, options: signOptions });
        return [`https://signed.example/${path}?${String(signOptions.responseDisposition).split(';')[0]}`];
      },
      path,
    }),
  };
  return { bucket: bucket as never, copies, deleted, signed };
}

const upload = (id: string) => `student-feedback/uploads/student-1/${draftId}/${id}`;

describe('media signatures', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])],
    ['image/webp', Uint8Array.from(Buffer.from('RIFF\0\0\0\0WEBP'))],
    ['video/webm', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])],
    ['video/mp4', MP4],
    ['video/quicktime', Uint8Array.from([0, 0, 0, 0x14, ...Buffer.from('ftypqt  ')])],
  ])('accepts a real %s header', (type, bytes) => {
    expect(matchesFeedbackMediaSignature(type, bytes)).toBe(true);
  });

  it('rejects HTML disguised as an image and unsupported types', () => {
    expect(matchesFeedbackMediaSignature('image/png', HTML)).toBe(false);
    expect(matchesFeedbackMediaSignature('video/mp4', HTML)).toBe(false);
    expect(matchesFeedbackMediaSignature('image/svg+xml', PNG)).toBe(false);
  });
});

describe('storeFeedbackAttachments', () => {
  it('verifies each upload at a pinned generation and copies it into the private report folder', async () => {
    const { bucket, copies } = fakeBucket({
      [upload(imageId)]: { contentType: 'image/png', size: 2048, generation: '11', head: PNG },
      [upload(videoId)]: { contentType: 'video/mp4', size: 4096, generation: '22', head: MP4 },
    });

    const stored = await storeFeedbackAttachments(
      'student-1',
      draftId,
      [
        { id: imageId, name: 'screen.png' },
        { id: videoId, name: 'clip.mp4' },
      ],
      bucket
    );

    expect(stored).toEqual([
      { id: imageId, name: 'screen.png', contentType: 'image/png', sizeBytes: 2048 },
      { id: videoId, name: 'clip.mp4', contentType: 'video/mp4', sizeBytes: 4096 },
    ]);
    expect(copies).toEqual([
      {
        from: upload(imageId),
        generation: '11',
        to: feedbackReportAttachmentPath(draftId, imageId),
        options: { metadata: {}, contentType: 'image/png', cacheControl: 'private, no-store' },
      },
      expect.objectContaining({ from: upload(videoId), generation: '22', to: feedbackReportAttachmentPath(draftId, videoId) }),
    ]);
  });

  it.each([
    ['missing', {}, /screen\.png" is no longer available/],
    ['an unsupported type', { [upload(imageId)]: { contentType: 'text/html', size: 20, generation: '1', head: HTML } }, /not a supported/],
    ['an oversized image', { [upload(imageId)]: { contentType: 'image/png', size: 11 * 1024 * 1024, generation: '1', head: PNG } }, /too large/],
    ['disguised HTML', { [upload(imageId)]: { contentType: 'image/png', size: 20, generation: '1', head: HTML } }, /valid \.png/],
  ])('rejects an upload that is %s without copying anything', async (_label, objects, message) => {
    const { bucket, copies } = fakeBucket(objects as Record<string, StoredObject>);
    await expect(storeFeedbackAttachments('student-1', draftId, [{ id: imageId, name: 'screen.png' }], bucket)).rejects.toMatchObject({
      code: 'FEEDBACK_INVALID_ATTACHMENT',
      message: expect.stringMatching(message),
    });
    expect(copies).toEqual([]);
  });

  it('only reads uploads inside the signed-in student’s draft folder', async () => {
    const { bucket } = fakeBucket({
      [`student-feedback/uploads/student-2/${draftId}/${imageId}`]: { contentType: 'image/png', size: 20, generation: '1', head: PNG },
    });
    await expect(storeFeedbackAttachments('student-1', draftId, [{ id: imageId, name: 'a.png' }], bucket)).rejects.toMatchObject({
      code: 'FEEDBACK_INVALID_ATTACHMENT',
    });
  });

  it('rejects uploads that exceed the combined size limit', async () => {
    const objects: Record<string, StoredObject> = {};
    const ids = ['a', 'b', 'c'].map(letter => `${letter}be84684-3cec-4dd5-87f7-f911fdd0bc96`);
    for (const id of ids) objects[upload(id)] = { contentType: 'video/mp4', size: 90 * 1024 * 1024, generation: '1', head: MP4 };
    const { bucket, copies } = fakeBucket(objects);
    await expect(
      storeFeedbackAttachments('student-1', draftId, ids.map(id => ({ id, name: `${id}.mp4` })), bucket)
    ).rejects.toMatchObject({ code: 'FEEDBACK_INVALID_ATTACHMENT' });
    expect(copies).toEqual([]);
  });

  it('deletes leftover uploads best-effort', async () => {
    const { bucket, deleted } = fakeBucket({});
    await deleteFeedbackUploads('student-1', draftId, [{ id: imageId }], bucket);
    expect(deleted).toEqual([upload(imageId)]);
  });
});

describe('getFeedbackAttachmentLinks', () => {
  it('signs short-lived view and download links with safe filenames', async () => {
    const { bucket, signed } = fakeBucket({});
    const report = {
      id: draftId,
      attachments: [
        { id: imageId, name: 'my "screen".png', contentType: 'image/png', sizeBytes: 10 },
        { id: videoId, name: 'phone.MOV', contentType: 'video/quicktime', sizeBytes: 10 },
      ],
    } as FeedbackReport;

    const links = await getFeedbackAttachmentLinks(report, bucket, Date.parse('2026-09-24T12:00:00.000Z'));

    expect(links.expiresAt).toBe('2026-09-24T12:15:00.000Z');
    expect(links.items).toEqual([
      { id: imageId, viewUrl: expect.stringContaining('inline'), downloadUrl: expect.stringContaining('attachment') },
      // QuickTime rarely plays inline, so it is download-only.
      { id: videoId, viewUrl: null, downloadUrl: expect.stringContaining('attachment') },
    ]);
    expect(signed[0]).toMatchObject({
      path: feedbackReportAttachmentPath(draftId, imageId),
      options: { action: 'read', responseDisposition: 'inline; filename="my__screen_.png"', responseType: 'image/png' },
    });
  });
});
