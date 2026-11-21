export type Me = { id: number; email: string; full_name: string | null; phone: string | null; city: string | null; avatar?: string | null };

async function send<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? niceValidation(j.detail) : msg;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** FastAPI validation errors -> one readable sentence. */
function niceValidation(errors: { loc?: (string | number)[]; msg?: string }[]) {
  const e = errors[0];
  const field = String(e?.loc?.[e.loc.length - 1] ?? "").replace("full_name", "name");
  if (field === "email") return "Please enter a valid email address.";
  if (field === "password") return "Password must be at least 8 characters.";
  if (field === "name") return "Please enter your full name.";
  return e?.msg ?? "Please check the form.";
}

export const authApi = {
  /** The logged-in user, or null when logged out. */
  me: () => send<Me>("/api/auth/me").catch(() => null),
  login: (email: string, password: string) => send<Me>("/api/auth/login", { email, password }),
  signup: (body: { full_name: string; email: string; password: string; phone?: string; city?: string }) =>
    send<Me>("/api/auth/signup", body),
  logout: () => send<void>("/api/auth/logout", {}),
};
