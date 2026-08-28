import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, Loader2, Mail, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — TrailerFlow Pro" },
      { name: "description", content: "Sign in to the TrailerFlow Pro compliance control tower for dispatch, yard, and gate operations." },
      { property: "og:title", content: "Sign in — TrailerFlow Pro" },
      { property: "og:description", content: "Secure access to your yard compliance control tower." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) navigate({ to: "/dashboard", replace: true });
    }).catch(() => undefined);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName || email },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account.");
          return;
        }
        toast.success("Account created.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-3 justify-center">
          <div className="h-11 w-11 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Truck className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight">TrailerFlow Pro</div>
            <div className="text-[11px] text-muted-foreground">Compliance Control Tower</div>
          </div>
        </Link>

        <div className="kpi-card mt-6 p-6">
          <h1 className="text-lg font-semibold tracking-tight">
            {mode === "signin" ? "Sign in to your yard" : "Create your account"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "signin" ? "Dispatchers, DC managers, and gate guards." : "First account becomes the DC Manager / Admin."}
          </p>

          <button
            onClick={google}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm font-medium hover:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.7l4-3z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field icon={User} placeholder="Full name" value={fullName} onChange={setFullName} type="text" />
            )}
            <Field icon={Mail} placeholder="you@company.com" value={email} onChange={setEmail} type="email" required />
            <Field icon={Lock} placeholder="Password" value={password} onChange={setPassword} type="password" required />
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Back to pricing</Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  icon: Icon, placeholder, value, onChange, type, required,
}: {
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string; value: string; onChange: (v: string) => void; type: string; required?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-border bg-surface-2/40 px-3 focus-within:border-primary/60">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
