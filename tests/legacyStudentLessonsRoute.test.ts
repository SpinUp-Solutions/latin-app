import { GET } from '@/src/app/api/lessons/route';

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

describe('legacy student lesson list route', () => {
  it('is retired so it cannot remain an independent normal-order reader', async () => {
    const response = (await GET()) as unknown as {
      status: number;
      body: { code: string };
    };

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('STUDENT_LESSON_LIST_RETIRED');
  });
});
