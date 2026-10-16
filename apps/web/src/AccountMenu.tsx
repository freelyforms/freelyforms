import { useCallback, useRef, useState } from "react";
import type { Me } from "./api.js";
import { navigate } from "./router.js";
import { useDismiss } from "./useDismiss.js";

/** Avatar-initial button with a small account menu (Account, Sign out). */
export function AccountMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  const initial = (me.user.name ?? me.user.email).trim().charAt(0).toUpperCase() || "?";

  useDismiss(root, open, close);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="avatar"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account menu for ${me.user.email}`}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {initial}
      </button>
      {open && (
        <div className="menu-list">
          <p className="menu-who">
            {me.user.name && <strong>{me.user.name}</strong>}
            <span className="muted small">{me.user.email}</span>
          </p>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              navigate("/account");
            }}
          >
            Account
          </button>
          <form method="post" action="/auth/logout">
            <button type="submit" className="menu-item">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
