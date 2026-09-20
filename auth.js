import { AsyncLocalStorage } from "node:async_hooks";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getApprovedStaff } from "@/lib/staffAuth";
import { createRequestContext, logApiEvent, serializeErrorForLog } from "@/lib/requestContext.mjs";
import { checkRateLimit } from "@/lib/rateLimit.mjs";

const authRequestStorage = new AsyncLocalStorage();

export function runWithAuthRequestContext(state, callback) {
  return authRequestStorage.run(state, callback);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile }) {
      const requestState = authRequestStorage.getStore();
      const context = requestState?.context || createRequestContext(null, "/api/auth/callback/google");
      if (account?.provider !== "google" || profile?.email_verified !== true || !profile.email) {
        logApiEvent("warn", "authentication_denied", context, { reason: "unverified_google_identity" });
        return false;
      }
      const limit = await checkRateLimit({
        policyName: "authVerifiedEmail",
        identifierKind: "email",
        identifierValue: profile.email,
        context,
      });
      if (!limit.configured || !limit.allowed) {
        if (requestState) requestState.securityFailure = limit;
        return false;
      }
      try {
        const approved = Boolean(await getApprovedStaff(profile.email));
        if (!approved) {
          logApiEvent("warn", "authentication_denied", context, {
            actorRef: limit.actorRef,
            reason: "staff_not_approved",
          });
        }
        return approved;
      } catch (error) {
        logApiEvent("error", "authentication_directory_lookup_failed", context, {
          actorRef: limit.actorRef,
          ...serializeErrorForLog(error),
        });
        return false;
      }
    },
  },
});
