import { describe, expect, it } from 'vitest';
import { checkForUpdates, setSwRegistration } from './swUpdate';

function fakeRegistration(
  overrides: Partial<ServiceWorkerRegistration> = {},
): ServiceWorkerRegistration {
  return {
    update: async () => {},
    waiting: null,
    installing: null,
    ...overrides,
  } as unknown as ServiceWorkerRegistration;
}

describe('checkForUpdates (FR-8.4)', () => {
  it('reports unsupported with no registration', async () => {
    setSwRegistration(undefined);
    expect(await checkForUpdates(0)).toBe('unsupported');
  });

  it('reports current when nothing is waiting after update()', async () => {
    setSwRegistration(fakeRegistration());
    expect(await checkForUpdates(0)).toBe('current');
  });

  it('reports updated when a new worker is waiting after update()', async () => {
    setSwRegistration(
      fakeRegistration({ waiting: {} as ServiceWorker }),
    );
    expect(await checkForUpdates(0)).toBe('updated');
  });

  it('reports updated when a new worker is still installing', async () => {
    setSwRegistration(
      fakeRegistration({ installing: {} as ServiceWorker }),
    );
    expect(await checkForUpdates(0)).toBe('updated');
  });

  it('reports error when update() throws — distinguishable from "current"', async () => {
    setSwRegistration(
      fakeRegistration({
        update: async () => {
          throw new Error('offline');
        },
      }),
    );
    expect(await checkForUpdates(0)).toBe('error');
  });
});
