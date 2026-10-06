import React, { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { app } from '@/src/services/firebase';
import { Providers } from '@/src/components/providers';

jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(),
  isSupported: jest.fn(),
}));
jest.mock('@/src/services/firebase', () => ({ app: { name: '[DEFAULT]' } }));
jest.mock('@/src/store', () => ({
  store: {
    getState: () => ({}),
    subscribe: () => () => undefined,
    dispatch: jest.fn(),
  },
}));
jest.mock('@/src/components/auth/auth-provider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockGetAnalytics = jest.mocked(getAnalytics);
const mockIsSupported = jest.mocked(isSupported);

describe('Firebase Analytics in the root providers', () => {
  let idleCallbacks: Map<number, IdleRequestCallback>;
  let nextIdleId: number;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS: '',
    });
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    mockIsSupported.mockResolvedValue(true);
    idleCallbacks = new Map();
    nextIdleId = 0;
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: jest.fn((callback: IdleRequestCallback) => {
        const id = nextIdleId++;
        idleCallbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      writable: true,
      value: jest.fn((id: number) => idleCallbacks.delete(id)),
    });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    Reflect.deleteProperty(window, 'cancelIdleCallback');
  });

  const runIdle = async () => {
    await act(async () => {
      const callbacks = [...idleCallbacks.values()];
      idleCallbacks.clear();
      callbacks.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
    });
  };

  it('restores Analytics through the app shell after load and idle without waiting for login', async () => {
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const screen = render(<Providers>App content</Providers>);

    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(mockIsSupported).not.toHaveBeenCalled();
    expect(mockGetAnalytics).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new Event('load')));
    expect(window.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(mockGetAnalytics).not.toHaveBeenCalled();

    await runIdle();
    expect(mockGetAnalytics).toHaveBeenCalledTimes(1);
    expect(mockGetAnalytics).toHaveBeenCalledWith(app);

    screen.rerender(<Providers>New route</Providers>);
    act(() => window.dispatchEvent(new Event('load')));
    await runIdle();
    expect(mockGetAnalytics).toHaveBeenCalledTimes(1);
  });

  it('uses a delayed fallback when idle callbacks are unavailable', async () => {
    Reflect.deleteProperty(window, 'requestIdleCallback');
    render(<Providers>App content</Providers>);

    await act(async () => jest.advanceTimersByTime(1999));
    expect(mockGetAnalytics).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockGetAnalytics).toHaveBeenCalledWith(app);
  });

  it.each(['development', 'test'] as const)('does not collect local %s traffic', async nodeEnv => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: nodeEnv });
    render(<Providers>App content</Providers>);
    await runIdle();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(mockIsSupported).not.toHaveBeenCalled();
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  it('does not collect emulator traffic in production builds', async () => {
    jest.replaceProperty(process, 'env', { ...process.env, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true' });
    render(<Providers>App content</Providers>);
    await runIdle();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  it('skips unsupported browsers', async () => {
    mockIsSupported.mockResolvedValue(false);
    render(<Providers>App content</Providers>);
    await runIdle();
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  it('cancels pending idle work during Strict Mode effect replay', async () => {
    render(
      <StrictMode>
        <Providers>App content</Providers>
      </StrictMode>
    );
    expect(window.cancelIdleCallback).toHaveBeenCalledWith(0);
    await runIdle();
    expect(mockGetAnalytics).toHaveBeenCalledTimes(1);
  });

  it('removes the load listener when unmounted before load', async () => {
    jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const screen = render(<Providers>App content</Providers>);
    screen.unmount();
    act(() => window.dispatchEvent(new Event('load')));
    await runIdle();
    expect(window.requestIdleCallback).not.toHaveBeenCalled();
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  it('cancels the timer fallback when unmounted', async () => {
    Reflect.deleteProperty(window, 'requestIdleCallback');
    const screen = render(<Providers>App content</Providers>);
    screen.unmount();
    await act(async () => jest.runAllTimers());
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  it('does not initialize after unmounting while the support check is pending', async () => {
    let resolveSupport!: (supported: boolean) => void;
    mockIsSupported.mockReturnValue(
      new Promise(resolve => {
        resolveSupport = resolve;
      })
    );
    const screen = render(<Providers>App content</Providers>);
    await runIdle();
    expect(mockIsSupported).toHaveBeenCalledTimes(1);
    screen.unmount();
    await act(async () => resolveSupport(true));
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  it('contains initialization failures so the app remains usable', async () => {
    const error = new Error('Analytics blocked');
    mockIsSupported.mockRejectedValue(error);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const screen = render(<Providers>App content</Providers>);
    await runIdle();
    expect(warn).toHaveBeenCalledWith('[Firebase] Analytics initialization failed', error);
    expect(screen.getByText('App content')).toBeInTheDocument();
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });
});
