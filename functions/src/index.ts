/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getEnvironment } from './utils/environment';

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// HTTP function that returns the current environment as JSON
export const environment = onRequest((request, response) => {
  const env = getEnvironment();

  logger.info('Environment requested:', { environment: env });
  console.log(`Running in ${env} environment`);

  // Set CORS headers to allow your frontend to access this
  response.set('Access-Control-Allow-Origin', '*');

  // Return as JSON for easy consumption by frontend
  response.json({
    environment: env,
  });
});
