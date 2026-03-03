import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getMongoClientPromise } from "@/lib/db/mongodb";
import { authorizePasswordLogin } from "@/lib/auth/credentials-service";

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
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      } else if (!token.userId && token.sub) {
        token.userId = token.sub;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && (token?.userId || token?.sub)) {
        session.user.id = token.userId || token.sub;
      }
      return session;
    },
  },
  trustHost: process.env.AUTH_TRUST_HOST === "true" ? true : undefined,
});
