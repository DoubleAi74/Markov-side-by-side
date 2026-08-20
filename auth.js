import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getMongoClientPromise } from "@/lib/db/mongodb";
import { authorizePasswordLogin } from "@/lib/auth/credentials-service";
import { ensureAuthUserUsername } from "@/lib/auth/users";

const adapterOptions = process.env.MONGODB_DB
  ? { databaseName: process.env.MONGODB_DB }
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(getMongoClientPromise, adapterOptions),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          return await authorizePasswordLogin({
            email: credentials?.email,
            password: credentials?.password,
          });
        } catch {
          return null;
        }
      },
    }),
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      } else if (!token.userId && token.sub) {
        token.userId = token.sub;
      }

      if (typeof user?.username === "string" && user.username.trim()) {
        token.username = user.username.trim();
      }

      if (
        (typeof token.username !== "string" || !token.username.trim()) &&
        (token.userId || token.sub)
      ) {
        try {
          const ensuredUser = await ensureAuthUserUsername(
            token.userId || token.sub,
            user?.name || user?.email || "",
          );
          if (ensuredUser?.username) {
            token.username = ensuredUser.username;
          }
        } catch {
          // DB error during username lookup — leave token.username unset for now,
          // it will be retried on the next JWT refresh.
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && (token?.userId || token?.sub)) {
        session.user.id = token.userId || token.sub;
        session.user.username =
          typeof token.username === "string" ? token.username : null;
      }
      return session;
    },
  },
  trustHost: process.env.AUTH_TRUST_HOST === "true" ? true : undefined,
});
