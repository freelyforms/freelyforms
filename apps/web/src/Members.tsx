import { useEffect, useId, useState } from "react";
import { api, ApiError, type Member } from "./api.js";

/**
 * Who else can open this form (ADR 0024). People sign in with Google using the email you add;
 * no email is sent, so tell them yourself.
 */
export function Members({ formId }: { formId: string }) {
  const uid = useId();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("viewer");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.members(formId).then(
      (r) => {
        setMembers(r.members);
      },
      () => {
        setMembers([]);
      },
    );
  }, [formId]);

  const add = async () => {
    setError(null);
    try {
      const saved = await api.saveMember(formId, { email: email.trim(), role });
      setMembers((m) => [...(m ?? []).filter((x) => x.email !== saved.email), saved]);
      setEmail("");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(
        code === "invalid_email"
          ? "Enter a valid email address."
          : code === "is_owner"
            ? "That's you: you already own this form."
            : "That person could not be added. Please try again.",
      );
    }
  };

  return (
    <section className="card">
      <h2 className="section-title">Sharing</h2>
      <p className="helper">
        Viewers see the form and its responses; editors can also change and publish the form and
        correct answers. They see responses here in Freely Forms, not in your Drive. They sign in
        with Google using the address you add — no email is sent, so let them know.
      </p>
      <div className="row">
        <label className="visually-hidden" htmlFor={`${uid}-email`}>
          Email
        </label>
        <input
          id={`${uid}-email`}
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <label className="visually-hidden" htmlFor={`${uid}-role`}>
          Role
        </label>
        <select
          id={`${uid}-role`}
          value={role}
          onChange={(e) => {
            setRole(e.target.value === "editor" ? "editor" : "viewer");
          }}
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button type="button" disabled={email.trim() === ""} onClick={() => void add()}>
          Add
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {members && members.length > 0 && (
        <ul className="members">
          {members.map((m) => (
            <li key={m.email}>
              <span>{m.email}</span>
              <span className="muted small">{m.role === "editor" ? "Editor" : "Viewer"}</span>
              <button
                type="button"
                className="ghost small"
                aria-label={`Remove ${m.email}`}
                onClick={() =>
                  void api.removeMember(formId, m.email).then(() => {
                    setMembers((list) => (list ?? []).filter((x) => x.email !== m.email));
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
