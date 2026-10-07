import { useSyncExternalStore } from 'react';
import { createInvites } from './invite.mjs';

// One invite store for the page: KINETIC and CURATOR share it, each under its own key.
const invites = createInvites();

/** [shimmering, markUsed] for a button. The sheen runs until the button is pressed, and returns after a minute idle. */
export function useInvite(key) {
  const shimmering = useSyncExternalStore(invites.subscribe, () => invites.active(key), () => true);
  return [shimmering, () => invites.use(key)];
}
