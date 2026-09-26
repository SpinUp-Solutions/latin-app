'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import {
  FEEDBACK_MAX_ATTACHMENTS,
  FEEDBACK_MAX_TOTAL_BYTES,
  feedbackAttachmentMetadataSchema,
  feedbackFinalizeAttachmentResponseSchema,
  feedbackReserveAttachmentResponseSchema,
} from '@/shared/student-feedback';
import { auth, storage } from '@/src/services/firebase';

export type FeedbackUploadStatus = 'uploading' | 'processing' | 'ready' | 'error';

export interface FeedbackUploadItem {
  id: string;
  name: string;
  size: number;
  contentType: string;
  status: FeedbackUploadStatus;
  progress: number;
  error?: string;
}

interface InternalItem extends FeedbackUploadItem {
  file: File;
  reserved: boolean;
  uploaded: boolean;
}

interface AttachmentApiError extends Error {
  code?: string;
}

async function attachmentRequest(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<unknown> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to upload feedback attachments');
  const token = await user.getIdToken();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const error = new Error(typeof payload.error === 'string' ? payload.error : 'Attachment request failed') as AttachmentApiError;
    if (typeof payload.code === 'string') error.code = payload.code;
    throw error;
  }
  return data;
}

function uploadToStaging(path: string, file: File, onProgress: (fraction: number) => void, onTask: (task: UploadTask) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
    onTask(task);
    task.on('state_changed',
      snapshot => onProgress(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
      reject,
      () => resolve()
    );
  });
}

export function useFeedbackAttachments({ sessionId, ensureSession }: { sessionId: string; ensureSession: () => Promise<void> }) {
  const [items, setItems] = useState<InternalItem[]>([]);
  const itemsRef = useRef<InternalItem[]>([]);
  const tasksRef = useRef<Map<string, UploadTask>>(new Map());
  const processPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const reserveAttemptsRef = useRef<Set<string>>(new Set());
  const removingRef = useRef<Set<string>>(new Set());
  const generationRef = useRef(0);
  const ensureSessionRef = useRef(ensureSession);
  ensureSessionRef.current = ensureSession;

  const update = useCallback((id: string, patch: Partial<InternalItem>) => {
    itemsRef.current = itemsRef.current.map(item => item.id === id ? { ...item, ...patch } : item);
    setItems(itemsRef.current);
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    for (const task of tasksRef.current.values()) task.cancel();
    tasksRef.current.clear();
    processPromisesRef.current.clear();
    reserveAttemptsRef.current.clear();
    removingRef.current.clear();
    itemsRef.current = [];
    setItems([]);
  }, []);

  useEffect(() => reset, [sessionId, reset]);

  const process = useCallback(async (id: string) => {
    const generation = generationRef.current;
    const current = () => itemsRef.current.find(item => item.id === id);
    const live = () => generation === generationRef.current && !removingRef.current.has(id) && Boolean(current());
    let item = current();
    if (!item) return;
    try {
      await ensureSessionRef.current();
      if (!live()) return;
      item = current();
      if (!item) return;
      const base = `/api/feedback/sessions/${encodeURIComponent(sessionId)}/attachments`;
      let stagingPath: string | undefined;
      const recovering = item.reserved || reserveAttemptsRef.current.has(id);
      if (!item.reserved) {
        reserveAttemptsRef.current.add(id);
        const raw = await attachmentRequest(base, 'POST', {
          attachmentId: id,
          originalName: item.name,
          contentType: item.contentType,
          sizeBytes: item.size,
        });
        const response = feedbackReserveAttachmentResponseSchema.parse(raw);
        stagingPath = response.stagingPath;
        if (!live()) return;
        update(id, { reserved: true });
      }
      if (!live()) return;
      item = current();
      if (!item) return;
      const finalizeUrl = `${base}/${encodeURIComponent(id)}/finalize`;
      // A retry first reconciles a completed upload whose response was lost.
      // Create-only Storage rules make blindly writing the same path unsafe.
      if (recovering) {
        try {
          const raw = await attachmentRequest(finalizeUrl, 'POST');
          const response = feedbackFinalizeAttachmentResponseSchema.parse(raw);
          if (response.attachment.status === 'ready') {
            if (live()) update(id, { status: 'ready', progress: 1, uploaded: true, error: undefined });
            return;
          }
        } catch (error) {
          if (item.uploaded || (error as AttachmentApiError).code !== 'FEEDBACK_INVALID_MEDIA') throw error;
        }
      }
      if (!stagingPath) stagingPath = `student-feedback/staging/${auth.currentUser?.uid ?? ''}/${sessionId}/${id}`;
      if (!auth.currentUser?.uid) throw new Error('Sign in to upload feedback attachments');
      update(id, { status: 'uploading', error: undefined });
      await uploadToStaging(
        stagingPath,
        item.file,
        fraction => { if (live()) update(id, { progress: fraction }); },
        task => tasksRef.current.set(id, task)
      );
      tasksRef.current.delete(id);
      if (!live()) return;
      update(id, { uploaded: true, status: 'processing', progress: 1 });
      const raw = await attachmentRequest(finalizeUrl, 'POST');
      const response = feedbackFinalizeAttachmentResponseSchema.parse(raw);
      if (response.attachment.status !== 'ready') throw new Error('Attachment is still processing');
      if (live()) update(id, { status: 'ready', error: undefined });
    } catch (error) {
      tasksRef.current.delete(id);
      if (live()) update(id, { status: 'error', error: error instanceof Error ? error.message : 'Upload failed' });
    }
  }, [sessionId, update]);

  const startProcess = useCallback((id: string) => {
    const promise = process(id).finally(() => {
      if (processPromisesRef.current.get(id) === promise) processPromisesRef.current.delete(id);
    });
    processPromisesRef.current.set(id, promise);
  }, [process]);

  const addFiles = useCallback((files: File[]) => {
    const added: InternalItem[] = [];
    let activeCount = itemsRef.current.length;
    let totalBytes = itemsRef.current.reduce((sum, item) => sum + item.size, 0);
    for (const file of files) {
      const id = crypto.randomUUID();
      let error: string | undefined;
      if (activeCount >= FEEDBACK_MAX_ATTACHMENTS || totalBytes + file.size > FEEDBACK_MAX_TOTAL_BYTES) {
        error = 'A report accepts up to 5 files and 200 MiB in total';
      } else if (file.size <= 0) {
        error = 'The file is empty';
      } else {
        const media = feedbackAttachmentMetadataSchema.safeParse({
          originalName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });
        if (!media.success) error = media.error.issues[0]?.message ?? 'Unsupported attachment';
      }
      const item: InternalItem = {
        id, name: file.name, size: file.size, contentType: file.type, status: error ? 'error' : 'uploading',
        progress: 0, error, file, reserved: false, uploaded: false,
      };
      added.push(item);
      if (!error) {
        activeCount += 1;
        totalBytes += file.size;
      }
    }
    itemsRef.current = [...itemsRef.current, ...added];
    setItems(itemsRef.current);
    for (const item of added) if (!item.error) startProcess(item.id);
  }, [startProcess]);

  const retry = useCallback((id: string) => {
    const item = itemsRef.current.find(candidate => candidate.id === id);
    if (!item || item.status !== 'error') return;
    update(id, { status: 'processing', error: undefined });
    startProcess(id);
  }, [startProcess, update]);

  const remove = useCallback(async (id: string) => {
    const item = itemsRef.current.find(candidate => candidate.id === id);
    if (!item) return;
    removingRef.current.add(id);
    tasksRef.current.get(id)?.cancel();
    tasksRef.current.delete(id);
    await processPromisesRef.current.get(id)?.catch(() => undefined);
    if (item.reserved || reserveAttemptsRef.current.has(id)) {
      try {
        await attachmentRequest(
          `/api/feedback/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(id)}`,
          'DELETE'
        );
      } catch (error) {
        if ((error as AttachmentApiError).code !== 'FEEDBACK_NOT_FOUND') {
          removingRef.current.delete(id);
          throw error;
        }
      }
    }
    itemsRef.current = itemsRef.current.filter(candidate => candidate.id !== id);
    setItems(itemsRef.current);
    reserveAttemptsRef.current.delete(id);
    removingRef.current.delete(id);
  }, [sessionId]);

  return useMemo(() => ({
    items: items.map(({ file: _file, reserved: _reserved, uploaded: _uploaded, ...item }) => item),
    addFiles, retry, remove, reset,
    readyIds: items.filter(item => item.status === 'ready').map(item => item.id),
    hasPendingOrFailed: items.some(item => item.status !== 'ready'),
  }), [items, addFiles, retry, remove, reset]);
}
