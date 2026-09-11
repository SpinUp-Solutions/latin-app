export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const addBreadcrumb = jest.fn();
export const setUser = jest.fn();
export const withScope = jest.fn((callback: (scope: { setUser: typeof setUser }) => unknown) => callback({ setUser }));
export const setTag = jest.fn();
export const init = jest.fn();
export const replayIntegration = jest.fn(() => ({}));
export const captureRouterTransitionStart = jest.fn();
export const captureRequestError = jest.fn();

const sentryMock = {
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  withScope,
  setTag,
  init,
  replayIntegration,
  captureRouterTransitionStart,
  captureRequestError,
};

export default sentryMock;
