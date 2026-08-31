import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { appCheck, auth } from '@/src/services/firebase';
import { apiEndpointRequiresAppCheck } from '@/shared/openai/app-check';

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

type ApiValidationIssue = {
  path?: unknown;
  message?: unknown;
};

const formatIssuePath = (path: unknown) => {
  const segments = Array.isArray(path)
    ? path.map(String)
    : typeof path === 'string'
      ? path.split('.').filter(Boolean)
      : [];

  const labels: string[] = [];
  segments.forEach((segment, index) => {
    if (/^\d+$/.test(segment)) {
      const position = Number(segment) + 1;
      const parent = segments[index - 1];
      labels.push(parent === 'pages' ? `Page ${position}` : parent === 'items' ? `Item ${position}` : `#${position}`);
      return;
    }
    if ((segment === 'pages' || segment === 'items') && /^\d+$/.test(segments[index + 1] ?? '')) return;
    labels.push(
      segment
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .toLowerCase()
    );
  });

  const label = labels.join(' › ');
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
};

export const formatApiValidationIssues = (issues: unknown): string[] => {
  if (!Array.isArray(issues)) return [];

  return Array.from(
    new Set(
      issues.flatMap(issue => {
        if (!isObject(issue) || typeof (issue as ApiValidationIssue).message !== 'string') return [];
        const message = (issue as ApiValidationIssue).message as string;
        const path = formatIssuePath((issue as ApiValidationIssue).path);
        return [path ? `${path}: ${message}` : message];
      })
    )
  );
};

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (!isObject(error)) return fallback;

  if (isObject(error.data)) {
    const message = error.data.error ?? error.data.message;
    const validationIssues = formatApiValidationIssues(error.data.issues);
    if (validationIssues.length > 0 && (typeof message !== 'string' || message === 'Invalid request')) {
      return `Please fix: ${validationIssues.join('; ')}`;
    }
    if (typeof message === 'string') return message;
  }

  if (typeof error.error === 'string') return error.error;
  if (typeof error.message === 'string') return error.message;
  return fallback;
};

export const hasApiErrorStatus = (error: unknown, status: number | string) =>
  isObject(error) && error.status === status;

export const isRetryableApiError = (error: unknown) => {
  if (!isObject(error)) return false;
  if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') return true;
  const status = error.status;
  const originalStatus = error.originalStatus;
  return (
    (typeof status === 'number' && Number.isFinite(status) && status >= 500) ||
    (typeof originalStatus === 'number' && Number.isFinite(originalStatus) && originalStatus >= 500)
  );
};

export const getApiErrorCode = (error: unknown): string | undefined => {
  if (!isObject(error) || !isObject(error.data)) return undefined;
  return typeof error.data.code === 'string' ? error.data.code : undefined;
};

export const createAuthenticatedBaseQuery = () =>
  fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: async (headers, { endpoint }) => {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set('authorization', `Bearer ${token}`);
      }
      if (appCheck && apiEndpointRequiresAppCheck(endpoint)) {
        const { getToken } = await import('firebase/app-check');
        const token = await getToken(appCheck);
        headers.set('X-Firebase-AppCheck', token.token);
      }
      return headers;
    },
  });
