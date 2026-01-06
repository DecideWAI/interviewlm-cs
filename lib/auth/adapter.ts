import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import type { PrismaClient } from "@prisma/client";

/**
 * Custom adapter that wraps PrismaAdapter but discards OAuth tokens.
 *
 * This follows the data minimization principle - we don't store tokens
 * we don't use, reducing security risk if the database is compromised.
 *
 * Tokens discarded:
 * - access_token: Used for OAuth provider API calls (not needed)
 * - refresh_token: Used to renew access tokens (not needed)
 * - id_token: OpenID Connect identity token (not needed)
 *
 * If future features require provider API access, revert to PrismaAdapter
 * and users will need to re-authenticate to populate tokens.
 */
export function createSecureAdapter(prisma: PrismaClient): Adapter {
  const baseAdapter = PrismaAdapter(prisma);

  return {
    ...baseAdapter,
    linkAccount: (account: AdapterAccount) => {
      // Strip sensitive tokens before storing
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { access_token, refresh_token, id_token, ...safeAccount } = account;

      // Call the base adapter with sanitized account data
      return baseAdapter.linkAccount!(safeAccount as AdapterAccount);
    },
  };
}
