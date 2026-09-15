import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getApprovedStaff } from "@/lib/staffAuth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" || profile?.email_verified !== true || !profile.email) {
        return false;
      }
      return Boolean(await getApprovedStaff(profile.email));
    },
  },
});
