import { saveBlobAsFile } from '@/src/services/testResultPdfService';

describe('saveBlobAsFile', () => {
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('revokes the object URL after the click has been dispatched', () => {
    const click = jest.fn();
    const remove = jest.fn();
    const createObjectURL = jest.fn(() => 'blob:test-result');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
    jest.spyOn(document, 'createElement').mockImplementation(() => ({ click, remove }) as unknown as HTMLAnchorElement);
    jest.spyOn(document.body, 'appendChild').mockImplementation(node => node);

    saveBlobAsFile(new Blob(['pdf']), 'jane-doe-quiz-2026-09-19.pdf');

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-result');
  });
});
