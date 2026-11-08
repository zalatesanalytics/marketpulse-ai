import { Link } from "@tanstack/react-router";
import { Plus, History, LogOut, Radar } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "New research", icon: Plus, exact: true },
  { to: "/history", label: "History", icon: History, exact: false },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border bg-[hsl(40_28%_95%)] px-5 py-7 md:flex">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
              <Radar className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-medium tracking-tight">Signal Desk</span>
          </Link>

          <p className="mt-8 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </p>
          <nav className="mt-2 flex flex-col gap-0.5">
            {NAV.map(({ to, label, icon: Icon, exact }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact }}
                className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-card text-foreground shadow-[0_1px_2px_rgba(20,18,12,0.06)]" }}
              >
                <Icon className="h-[15px] w-[15px]" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto rounded-lg border border-border bg-card/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Signed in</p>
            <p className="mt-1 truncate text-[12.5px]">{user?.full_name || user?.email || "Desk member"}</p>
            <button
              onClick={() => logout()}
              className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-5 py-3 md:hidden">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
                <Radar className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium">Signal Desk</span>
            </Link>
            <div className="flex items-center gap-1">
              {NAV.map(({ to, label, icon: Icon, exact }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact }}
                  className={cn("rounded-md p-2 text-muted-foreground")}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                  aria-label={label}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </header>
          <main className="flex-1 px-5 py-8 md:px-10 md:py-12">{children}</main>
        </div>
      </div>
    </div>
  );
}