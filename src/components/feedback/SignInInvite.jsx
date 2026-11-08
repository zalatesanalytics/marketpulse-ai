import { Link } from "@tanstack/react-router";
import { LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// Shown to a guest once a report has been read: the desk keeps answering, and an
// account is what keeps the report and unlocks more runs.
export default function SignInInvite() {
  const { isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();

  if (isLoadingAuth || isAuthenticated) return null;

  return (
    <div className="rounded-xl border border-dashed border-border bg-[hsl(40_28%_96%)] px-4 py-3.5">
      <p className="text-[12.5px] leading-relaxed">
        You’re reading as a guest. Sign in to keep this report, reopen it any time from your history and run more
        studies — or create a free account in a moment.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={navigateToLogin}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[11.5px] text-background transition-opacity hover:opacity-90"
        >
          <LogIn className="h-3 w-3" />
          Sign in
        </button>
        <Link
          to="/register"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] transition-colors hover:border-foreground/30"
        >
          <UserPlus className="h-3 w-3" />
          Create account
        </Link>
      </div>
    </div>
  );
}