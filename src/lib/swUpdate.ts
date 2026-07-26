// Manual "check for updates" (PRD FR-8.4), built on the registration handed
// to us via useRegisterSW's onRegisteredSW callback (see UpdateBanner).

let registration: ServiceWorkerRegistration | undefined;

export function setSwRegistration(r: ServiceWorkerRegistration | undefined): void {
  registration = r;
}

export type UpdateCheckResult = 'updated' | 'current' | 'unsupported' | 'error';

/**
 * Triggers a manual update check. If a new worker starts installing/waiting,
 * `useRegisterSW`'s own listeners will flip `needRefresh` and the banner
 * appears on its own — this just reports which of the FR-8.4 outcomes
 * happened, so "nothing happened" (current) reads differently from "the
 * check failed" (error/unsupported).
 */
export async function checkForUpdates(waitMs = 1500): Promise<UpdateCheckResult> {
  if (!registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'error';
  }
  // Installation after update() is async; give it a moment before looking.
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return registration.waiting || registration.installing ? 'updated' : 'current';
}
