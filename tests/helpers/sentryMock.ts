export const captureException = jest.fn();
export const setUser = jest.fn();
export const setTag = jest.fn();
export const init = jest.fn();
export const replayIntegration = jest.fn(() => ({}));
export const captureRouterTransitionStart = jest.fn();
export const captureRequestError = jest.fn();

export default {
  captureException,
  setUser,
  setTag,
  init,
  replayIntegration,
  captureRouterTransitionStart,
  captureRequestError,
};
