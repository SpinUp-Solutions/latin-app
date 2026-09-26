'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import {
  FEEDBACK_MAX_ATTACHMENTS,
  FEEDBACK_MAX_TOTAL_BYTES,
  formatFileSize,
  feedbackMediaLimit,
  feedbackUploadPath,
} from '@/shared/student-feedback';
import { auth, storage } from '@/src/services/firebase';

export interface FeedbackUpload {
  id: string;
  file: File;
  name: string;
  size: number;
  contentType: string;
  /** Local object URL for image thumbnails. */
  previewUrl: string | null;
  status: 'uploading' | 'ready' | 'error';
  progress: number;
}

function rejectionFor(file: File, count: number, totalBytes: number): string | null {
  const limit = feedbackMediaLimit(file.type);
  if (!limit) return `${file.name} isn't supported. Use PNG, JPG, WebP, MP4, WebM or MOV.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > limit) return `${file.name} is larger than ${formatFileSize(limit)}.`;
  if (count >= FEEDBACK_MAX_ATTACHMENTS) return `You can attach up to ${FEEDBACK_MAX_ATTACHMENTS} files.`;
  if (totalBytes + file.size > FEEDBACK_MAX_TOTAL_BYTES) return `Attachments can total at most ${formatFileSize(FEEDBACK_MAX_TOTAL_BYTES)}.`;
  return null;
}

function releasePreview(upload: FeedbackUpload) {
  if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
}

/** Uploads straight to Storage. The server verifies and copies the files when the report is submitted. */
export function useFeedbackUploads(draftId: string) {
  const [uploads, setUploads] = useState<FeedbackUpload[]>([]);
  const uploadsRef = useRef<FeedbackUpload[]>([]);
  const tasksRef = useRef(new Map<string, UploadTask>());

  const commit = useCallback((update: (current: FeedbackUpload[]) => FeedbackUpload[]) => {
    uploadsRef.current = update(uploadsRef.current);
    setUploads(uploadsRef.current);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<FeedbackUpload>) =>
      commit(current => current.map(upload => (upload.id === id ? { ...upload, ...changes } : upload))),
    [commit]
  );

  const start = useCallback(
    (upload: FeedbackUpload) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        patch(upload.id, { status: 'error' });
        return;
      }
      const target = ref(storage, feedbackUploadPath(uid, draftId, upload.id));
      const task = uploadBytesResumable(target, upload.file, { contentType: upload.contentType });
      tasksRef.current.set(upload.id, task);
      // Callbacks for removed uploads patch nothing, because IDs are never reused.
      task.on(
        'state_changed',
        snapshot => patch(upload.id, { progress: snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0 }),
        () => {
          tasksRef.current.delete(upload.id);
          patch(upload.id, { status: 'error' });
        },
        () => {
          tasksRef.current.delete(upload.id);
          patch(upload.id, { status: 'ready', progress: 1 });
        }
      );
    },
    [draftId, patch]
  );

  /** Starts uploading every acceptable file and returns a message for each rejected one. */
  const addFiles = useCallback(
    (files: File[]): string[] => {
      const rejected: string[] = [];
      const added: FeedbackUpload[] = [];
      let count = uploadsRef.current.length;
      let totalBytes = uploadsRef.current.reduce((sum, upload) => sum + upload.size, 0);
      for (const file of files) {
        const problem = rejectionFor(file, count, totalBytes);
        if (problem) {
          rejected.push(problem);
          continue;
        }
        count += 1;
        totalBytes += file.size;
        added.push({
          id: crypto.randomUUID(),
          file,
          name: file.name.trim().slice(0, 255) || 'attachment',
          size: file.size,
          contentType: file.type,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          status: 'uploading',
          progress: 0,
        });
      }
      commit(current => [...current, ...added]);
      added.forEach(start);
      return rejected;
    },
    [commit, start]
  );

  const retry = useCallback(
    (id: string) => {
      const upload = uploadsRef.current.find(item => item.id === id);
      if (!upload || upload.status !== 'error') return;
      // Uploads are create-only, so a retry writes to a fresh path.
      const next: FeedbackUpload = { ...upload, id: crypto.randomUUID(), status: 'uploading', progress: 0 };
      commit(current => current.map(item => (item.id === id ? next : item)));
      start(next);
    },
    [commit, start]
  );

  const remove = useCallback(
    (id: string) => {
      tasksRef.current.get(id)?.cancel();
      tasksRef.current.delete(id);
      const upload = uploadsRef.current.find(item => item.id === id);
      if (upload) releasePreview(upload);
      commit(current => current.filter(item => item.id !== id));
    },
    [commit]
  );

  const reset = useCallback(() => {
    for (const task of tasksRef.current.values()) task.cancel();
    tasksRef.current.clear();
    uploadsRef.current.forEach(releasePreview);
    commit(() => []);
  }, [commit]);

  useEffect(() => reset, [reset]);

  return useMemo(
    () => ({
      uploads,
      addFiles,
      retry,
      remove,
      reset,
      uploading: uploads.some(upload => upload.status === 'uploading'),
      failed: uploads.some(upload => upload.status === 'error'),
      ready: uploads.filter(upload => upload.status === 'ready').map(({ id, name }) => ({ id, name })),
    }),
    [uploads, addFiles, retry, remove, reset]
  );
}
