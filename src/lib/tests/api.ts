import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { TestServiceError } from './errors';

export const testRouteErrorResponse = createRouteErrorResponse(TestServiceError);
