// Thin wrapper over Privy. If Privy isn't configured, returns a stub so the
// rest of the app keeps rendering — login buttons just no-op with a warning.

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { isPrivyConfigured } from '../lib/privy.js';

export function useAuth() {
  if (!isPrivyConfigured()) {
    return {
      ready: true,
      configured: false,
      authenticated: false,
      user: null,
      address: null,
      login: () => {
        // eslint-disable-next-line no-alert
        alert(
          'Privy is not configured. Add VITE_PRIVY_APP_ID to web/.env and restart the dev server.',
        );
      },
      logout: () => {},
    };
  }

  const privy = usePrivy();
  const { wallets } = useWallets();
  const address = wallets[0]?.address ?? privy.user?.wallet?.address ?? null;

  return {
    ready: privy.ready,
    configured: true,
    authenticated: privy.authenticated,
    user: privy.user,
    address,
    login: privy.login,
    logout: privy.logout,
  };
}
