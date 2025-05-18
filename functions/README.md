# Firebase Functions for Latin App

This directory contains Firebase Cloud Functions for the Latin App project. These functions are deployed across three different environments:

- Development: `latin-app-dev`
- Staging: `latin-app-staging`
- Production: `latin-app-prod`

## Functions

### logEnvironment

An HTTP function that logs and returns the current environment (development, staging, or production).

- **URL**: `https://<region>-<project-id>.cloudfunctions.net/logEnvironment`
- **Method**: GET
- **Response**: Text showing the current environment

## Local Development

To run functions locally:

```bash
# From the project root
npm run functions:serve
```

## Deployment

To deploy functions to specific environments:

```bash
# Deploy to development
npm run functions:dev

# Deploy to staging
npm run functions:staging

# Deploy to production
npm run functions:prod

# Deploy to all environments
npm run functions:all
```

## Environment Detection

The functions automatically detect which environment they're running in based on the Firebase project ID.

## Adding New Functions

When adding new functions, follow the pattern in `src/index.ts` to ensure they correctly log the environment and handle environment-specific behavior.
