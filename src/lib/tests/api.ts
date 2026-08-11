import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { TestServiceError } from './errors';
import { VocabularyPoolAssignmentError } from '@/src/lib/vocabulary-pools/assignment.server';

export const testRouteErrorResponse = createRouteErrorResponse(TestServiceError, VocabularyPoolAssignmentError);
