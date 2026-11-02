import "./globals.css";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { appName } from "@/lib/mailer";

export const metadata = { title: appName(), description: "Race registration for runs, rides, triathlons and relays." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="logo">{appName()}</Link>
            <nav>
              <Link href="/">Find a race</Link>
              {user?.is_organizer ? <Link href="/organizer">Organizer</Link> : <Link href="/organizer">For organizers</Link>}
              {user ? (
                <>
                  <Link href="/account">My account</Link>
                  <form action="/logout" method="post"><button className="small secondary">Log out</button></form>
                </>
              ) : (
                <Link href="/login" className="btn small">Log in</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="bottom">
          <div className="wrap row">
            <span>© {new Date().getFullYear()} {appName()}</span>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/account/data">Your data</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
