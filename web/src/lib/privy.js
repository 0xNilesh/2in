// Privy provider config. Login methods are intentionally narrow: wallet first,
// email as fallback. No social-login OAuths here — those are dedicated flows
// (Twitter is a separate ingestion step in onboarding).

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

export const privyConfig = {
  loginMethods: ['wallet', 'email'],
  appearance: {
    theme: 'dark',
    accentColor: '#ff8a5b',
    logo: undefined,
    showWalletLoginFirst: true,
  },
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
    requireUserPasswordOnCreate: false,
  },
};

export function isPrivyConfigured() {
  return Boolean(PRIVY_APP_ID && PRIVY_APP_ID.length > 0);
}
