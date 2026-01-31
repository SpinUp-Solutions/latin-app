'use client';

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from '@/src/components/ui/alert-dialog';
import { Button } from '@/src/components/ui/button';
import { AlertTriangle, XCircle, Wifi, Server, AlertCircle, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export type ErrorType = 'network' | 'validation' | 'server' | 'conflict' | 'auth' | 'unknown';

interface ErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  errorType: ErrorType;
  errorMessage: string;
  technicalDetails?: string;
  onRetry?: () => void;
  onSaveToRecovery?: () => void;
  retrying?: boolean;
  savingToRecovery?: boolean;
}

const errorConfig: Record<
  ErrorType,
  { icon: React.ElementType; label: string; color: string; bgColor: string; borderColor: string }
> = {
  network: {
    icon: Wifi,
    label: 'Network Error',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  validation: {
    icon: AlertCircle,
    label: 'Validation Error',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  server: {
    icon: Server,
    label: 'Server Error',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  conflict: {
    icon: XCircle,
    label: 'Conflict Error',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  auth: {
    icon: AlertTriangle,
    label: 'Authentication Error',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  unknown: {
    icon: AlertTriangle,
    label: 'Unexpected Error',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
};

export const ErrorDialog: React.FC<ErrorDialogProps> = ({
  isOpen,
  onClose,
  title = 'Save Failed',
  errorType,
  errorMessage,
  technicalDetails,
  onRetry,
  onSaveToRecovery,
  retrying = false,
  savingToRecovery = false,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const config = errorConfig[errorType];
  const Icon = config.icon;

  const handleCopyDetails = async () => {
    const details = `Error Type: ${config.label}
Message: ${errorMessage}
${technicalDetails ? `\nTechnical Details:\n${technicalDetails}` : ''}
Timestamp: ${new Date().toISOString()}`;

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      toast.success('Error details copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-full ${config.bgColor}`}>
              <Icon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div>
              <AlertDialogTitle className="text-xl text-red-700">{title}</AlertDialogTitle>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color} border ${config.borderColor} mt-1`}>
                {config.label}
              </span>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="my-4">
          <p className="text-gray-700 text-sm leading-relaxed">{errorMessage}</p>
          <p className="text-gray-500 text-xs mt-2">Your work has NOT been lost. You can try again or save to recovery.</p>
        </div>

        {technicalDetails && (
          <div className="mb-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Technical Details
            </button>
            {showDetails && (
              <pre className="mt-2 p-3 bg-gray-100 rounded-md text-xs text-gray-600 overflow-x-auto max-h-40 overflow-y-auto border">
                {technicalDetails}
              </pre>
            )}
          </div>
        )}

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            {onRetry && (
              <Button onClick={onRetry} disabled={retrying || savingToRecovery} className="flex-1 sm:flex-none">
                {retrying ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Retrying...
                  </>
                ) : (
                  'Try Again'
                )}
              </Button>
            )}
            {onSaveToRecovery && (
              <Button
                onClick={onSaveToRecovery}
                disabled={retrying || savingToRecovery}
                variant="secondary"
                className="flex-1 sm:flex-none bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300">
                {savingToRecovery ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-800 mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save to Recovery'
                )}
              </Button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={handleCopyDetails} variant="outline" size="sm" className="flex-1 sm:flex-none">
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied!' : 'Copy Details'}
            </Button>
            <Button onClick={onClose} variant="ghost" className="flex-1 sm:flex-none">
              Close
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Helper functions to parse errors
export function parseErrorType(error: unknown): ErrorType {
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: number; message?: string };
    if (err.status === 409) return 'conflict';
    if (err.status === 400) return 'validation';
    if (err.status === 401 || err.status === 403) return 'auth';
    if (err.status && err.status >= 500) return 'server';
    if (err.message?.toLowerCase().includes('fetch') || err.message?.toLowerCase().includes('network')) return 'network';
  }
  return 'unknown';
}

export function getHumanReadableError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: number; data?: { error?: string }; message?: string };
    if (err.status === 409) return 'A lesson with this ID already exists. This usually happens when continuing from an old draft.';
    if (err.status === 400)
      return err.data?.error || 'Invalid lesson data. Please check that all required fields are filled in correctly.';
    if (err.status === 401) return 'Your session has expired. Please refresh the page and log in again.';
    if (err.status === 403) return 'You do not have permission to perform this action.';
    if (err.status && err.status >= 500)
      return 'The server encountered an error while processing your request. Please try again in a moment.';
    if (err.message?.toLowerCase().includes('network'))
      return 'Unable to connect to the server. Please check your internet connection and try again.';
  }
  return 'An unexpected error occurred while saving your lesson. Please try again or save to recovery.';
}

export function formatErrorDetails(error: unknown): string {
  try {
    if (typeof error === 'object' && error !== null) {
      return JSON.stringify(error, null, 2);
    }
    return String(error);
  } catch {
    return 'Unable to format error details';
  }
}
