/** Shown for any address that isn't a page on the site (old, mistyped or expired links). */
import { useEffect } from "react";
import logo from "../assets/logo.png";
import "./notfound.css";

export default function NotFound({ reason = "page" }: { reason?: "page" | "deal" }) {
  useEffect(() => {
    document.title = "Not available · Discount فرویش";
  }, []);
  return (
    <div className="nf">
      <header className="nf-top">
        <a href="/" aria-label="Discount فرویش home"><img src={logo} alt="Discount فرویش" /></a>
      </header>
      <main className="nf-main">
        <div className="nf-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
        </div>
        <h1>{reason === "deal" ? "This deal has expired or isn't available" : "This link has expired or isn't available"}</h1>
        <p>
          {reason === "deal"
            ? "The offer may have ended, or the restaurant no longer has deals with these banks."
            : "The page may have been moved or removed, or the link might be mistyped."}
        </p>
        <div className="nf-actions">
          <a className="nf-btn primary" href="/dashboard">See today's deals</a>
          <a className="nf-btn" href="/">Go to home page</a>
        </div>
        <code className="nf-path">{window.location.pathname}</code>
      </main>
    </div>
  );
}
