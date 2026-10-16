import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Account } from "./Account.js";
import { api, ApiError, GRANT_DRIVE_URL, SIGN_IN_URL, type Me } from "./api.js";
import { Editor } from "./Editor.js";
import { FormList } from "./FormList.js";
import { href, navigate, useRoute } from "./router.js";

const AUTH_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  invalid_state: "The sign-in link expired. Please try again.",
  no_refresh_token: "Google did not grant offline access. Please try again.",
};

/** Internal links that navigate without reloading the page. */
export function Link(props: { to: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(props.to);
  };
  return (
    <a href={href(props.to)} className={props.className} onClick={onClick}>
      {props.children}
    </a>
  );
}

export function App() {
  const route = useRoute();
  const [me, setMe] = useState<Me | null | "loading" | "error">("loading");

  const loadMe = useCallback(() => {
    api.me().then(setMe, (err: unknown) => {
      setMe(err instanceof ApiError && err.status === 401 ? null : "error");
    });
  }, []);
  useEffect(loadMe, [loadMe]);

  if (me === "loading") return <p className="center muted">Loading…</p>;
  if (me === "error") {
    return (
      <p className="center" role="alert">
        Freely Forms is not reachable right now. Please reload the page in a moment.
      </p>
    );
  }
  if (me === null) return <SignIn />;

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Freely Forms
        </Link>
        <span className="spacer" />
        <Link to="/account" className="small account-link">
          {me.user.email}
        </Link>
        <form method="post" action="/auth/logout">
          <button className="ghost small" type="submit">
            Sign out
          </button>
        </form>
      </header>
      {!me.google.driveAccess && (
        <div className="banner" role="status">
          Freely Forms needs access to the files it creates in your Google Drive to save responses
          to a Google Sheet. <a href={GRANT_DRIVE_URL}>Grant access</a>
        </div>
      )}
      {route.name === "forms" && <FormList />}
      {route.name === "form" && <Editor key={route.id} id={route.id} />}
      {route.name === "account" && <Account me={me} onChange={loadMe} />}
      {route.name === "notFound" && (
        <main className="page">
          <h1>Page not found</h1>
          <p>
            <Link to="/">Back to your forms</Link>
          </p>
        </main>
      )}
    </>
  );
}

function SignIn() {
  const error = new URLSearchParams(window.location.search).get("auth_error");
  return (
    <main className="signin">
      <h1>Freely Forms</h1>
      <p className="lead">Free forms whose responses go straight to your own Google Sheet.</p>
      {error && (
        <p className="alert" role="alert">
          {AUTH_ERRORS[error] ?? "Sign-in failed. Please try again."}
        </p>
      )}
      <a className="button primary" href={SIGN_IN_URL}>
        Sign in with Google
      </a>
      <p className="muted small">
        We ask only for your name, email and access to the files Freely Forms creates in your Drive.
        We never see the rest of your Drive.
      </p>
    </main>
  );
}
