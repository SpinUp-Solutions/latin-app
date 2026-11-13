import { defaultStackParser, exceptionFromError } from '@sentry/browser';
import { init, type ErrorEvent } from '@sentry/nextjs';
import '@/src/instrumentation-client';

const { beforeSend } = (init as jest.Mock).mock.calls[0][0] as {
  beforeSend: (event: ErrorEvent, hint: object) => ErrorEvent | null;
};

// The event the browser SDK builds for an error with this Chrome stack.
const eventForStack = (stack: string): ErrorEvent => {
  const error = new Error();
  error.stack = stack;
  return { type: undefined, exception: { values: [exceptionFromError(defaultStackParser, error)] } };
};

describe('client Sentry beforeSend', () => {
  it('drops an error thrown entirely by a script injected into the page', () => {
    // LATIN-APP-PROD-J: a script that defined window.__sel crashed on a lesson page.
    const event = eventForStack(
      [
        "IndexSizeError: Failed to execute 'setStart' on 'Range': The offset 7 is larger than the node's length (2).",
        '    at window.__sel (<anonymous>:3:127)',
        '    at <anonymous>:4:59',
      ].join('\n')
    );

    expect(beforeSend(event, {})).toBeNull();
  });

  it.each([
    [
      'any frame is from our bundles',
      [
        "TypeError: Cannot read properties of undefined (reading 'text')",
        '    at Array.map (<anonymous>)',
        '    at renderNode (https://latin-app-three.vercel.app/_next/static/chunks/0a1b2c.js:1:2345)',
      ],
    ],
    ['every frame is a built-in function', ["SyntaxError: Unexpected token '<'", '    at JSON.parse (<anonymous>)']],
    ['the error has no stack', ['Error: Load failed']],
  ])('keeps an error when %s', (_case, stack) => {
    const event = eventForStack(stack.join('\n'));

    expect(beforeSend(event, {})).toBe(event);
  });
});
