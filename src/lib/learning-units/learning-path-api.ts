import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { LearningPathServiceError } from './learning-path-errors';

export const learningPathRouteErrorResponse = createRouteErrorResponse(LearningPathServiceError);
