/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getEnvironment } from './utils/environment';

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// Callable function that returns the current environment
export const environment = onCall(request => {
  const env = getEnvironment();

  logger.info('Environment requested:', { environment: env });
  console.log(`Running in ${env} environment`);

  return { environment: env };
});
