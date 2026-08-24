'use client';

import React from 'react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { reportUnexpectedError } from '@/src/lib/report-unexpected-error';

interface ExerciseErrorBoundaryProps {
  children: React.ReactNode;
  exerciseId?: string;
  contentType?: string;
  pageIndex?: number;
  itemIndex?: number;
  lessonId?: string;
}

interface ExerciseErrorBoundaryState {
  hasError: boolean;
}

export class ExerciseErrorBoundary extends React.Component<ExerciseErrorBoundaryProps, ExerciseErrorBoundaryState> {
  constructor(props: ExerciseErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ExerciseErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Exercise rendering error:', error, errorInfo);
    reportUnexpectedError(error, {
      tags: {
        surface: 'exercise_error_boundary',
        ...(this.props.lessonId ? { lessonId: this.props.lessonId } : {}),
        ...(this.props.exerciseId ? { exerciseId: this.props.exerciseId } : {}),
        ...(this.props.contentType ? { contentType: this.props.contentType } : {}),
        ...(this.props.pageIndex !== undefined ? { pageIndex: String(this.props.pageIndex) } : {}),
        ...(this.props.itemIndex !== undefined ? { itemIndex: String(this.props.itemIndex) } : {}),
      },
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <RomanCard>
          <RomanCardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-roman-red/60 mb-4" />
            <p className="text-roman-red font-medium">This exercise failed to load</p>
            <p className="text-roman-stone text-sm mt-2">
              An error occurred while rendering this content. You can try again or skip to the next item.
            </p>
            <Button variant="outline" className="mt-4" onClick={this.handleReset}>
              Try Again
            </Button>
          </RomanCardContent>
        </RomanCard>
      );
    }

    return this.props.children;
  }
}
