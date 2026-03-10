import { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: "openid profile email User.Read",
        },
      },
    }),
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          console.log("🔐 Credentials auth attempt:", { email: credentials?.email });

          if (!credentials?.email || !credentials?.password) {
            console.log("❌ Missing credentials");
            return null;
          }

          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email: credentials.email }
          });

          console.log("👤 User found:", { exists: !!user, hasPassword: !!user?.password, email: user?.email });

          if (!user || !user.password) {
            console.log("❌ User not found or no password");
            return null;
          }

          // Verify password
          const isValid = await bcrypt.compare(credentials.password, user.password);
          console.log("🔑 Password valid:", isValid);

          if (!isValid) {
            console.log("❌ Invalid password");
            return null;
          }

          console.log("✅ Auth successful");
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error) {
          console.error("❌ Auth error:", error);
          return null;
        }
      }
    }),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) {
        return false;
      }

      try {
        // For Microsoft OAuth, auto-create Person records
        if (account?.provider === "azure-ad") {
          await prisma.person.upsert({
            where: { email: user.email },
            update: {
              name: user.name || user.email,
              updated_at: new Date(),
            },
            create: {
              email: user.email,
              name: user.name || user.email,
              microsoft_user_id: account?.providerAccountId,
              role: "Employee",
              billable: true,
              ctc_monthly: 0,
              utilization_target: 0.80,
              start_date: new Date(),
            },
          });

          // Check if user has app access - only allow existing users
          const appUser = await prisma.user.findUnique({
            where: { email: user.email },
          });

          if (!appUser) {
            console.log("❌ Azure AD sign-in rejected: no User record for", user.email);
            return false;
          }

          // Update auth_provider for existing users if needed
          if (!appUser.auth_provider || appUser.auth_provider === "microsoft") {
            await prisma.user.update({
              where: { email: user.email },
              data: { auth_provider: "microsoft" },
            });
          }
        }

        // For Credentials provider, user already exists (checked in authorize)
        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },

    async jwt({ token, user }) {
      // On sign-in or if role is missing from token, fetch from DB
      const email = user?.email || token?.email;
      if (email && !token.role) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: email as string },
            select: { id: true, role: true },
          });
          if (dbUser) {
            token.userId = dbUser.id;
            token.role = dbUser.role;
          }
        } catch (error) {
          console.error("Error in jwt callback:", error);
        }
      } else if (user?.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true, role: true },
          });
          if (dbUser) {
            token.userId = dbUser.id;
            token.role = dbUser.role;
          }
        } catch (error) {
          console.error("Error in jwt callback:", error);
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string;
        session.user.role = token.role as any;
      }

      return session;
    },
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  cookies: {
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
    state: {
      name: "next-auth.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },

  debug: process.env.NODE_ENV === "development",
};
