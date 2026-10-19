import * as Sentry from '@sentry/nextjs';

/**
 * Chrome names code evaluated from a string `<anonymous>`. An error whose every frame is such code
 * came from a script injected into the page (a browser agent, an extension running in the page, the
 * DevTools console), not from our bundles. Built-ins like `Array.map` are also `<anonymous>` but have
 * no line number, so a stack made only of them is still reported.
 */
function isInjectedScriptError(event: Sentry.ErrorEvent) {
  const frames = event.exception?.values?.flatMap(value => value.stacktrace?.frames ?? []) ?? [];

  return (
    frames.length > 0 &&
    frames.every(frame => frame.filename === '<anonymous>') &&
    frames.some(frame => frame.lineno !== undefined)
  );
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

  // Buffer locally; only upload when an error is captured.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  beforeSend: event => (isInjectedScriptError(event) ? null : event),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
