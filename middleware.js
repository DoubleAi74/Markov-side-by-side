import { NextResponse } from "next/server";
import { decode } from "next-auth/jwt";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function sessionCookieNames(cookies) {
  return cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) =>
      SESSION_COOKIE_NAMES.some(
        (prefix) => name === prefix || name.startsWith(`${prefix}.`),
      ),
    );
}

function clearSessionCookies(request, response) {
  for (const name of sessionCookieNames(request.cookies)) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }
}

export async function middleware(request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();

  const names = sessionCookieNames(request.cookies);
  if (names.length === 0) return NextResponse.next();

  const salt =
    names.find((name) => SESSION_COOKIE_NAMES.includes(name)) ??
    SESSION_COOKIE_NAMES[0];
  const token =
    request.cookies.get(salt)?.value ??
    names
      .filter((name) => name.startsWith(`${salt}.`))
      .sort()
      .map((name) => request.cookies.get(name)?.value ?? "")
      .join("");

  if (!token) return NextResponse.next();

  try {
    const payload = await decode({ token, secret, salt });
    if (payload) return NextResponse.next();
  } catch {
    // Cookie was issued with a different AUTH_SECRET.
  }

  const response = NextResponse.next();
  clearSessionCookies(request, response);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
