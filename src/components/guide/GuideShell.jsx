import { Link } from "@tanstack/react-router";
import { Radar, ArrowLeft } from "lucide-react";
import { SECTIONS } from "@/components/guide/nav";

const jumpTo = (id) => (event) => {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function GuideShell({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-5 py-4 md:px-10">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background">
              <Radar className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-medium tracking-tight">Signal Desk</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to the desk
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1100px] px-5 py-10 md:px-10 md:py-14">
        <div className="md:grid md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
          <nav className="hidden md:block">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">On this page</p>
            <ul className="mt-3 space-y-1.5">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={jumpTo(section.id)}
                    className="block rounded text-[12.5px] leading-snug text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-10">{children}</div>
        </div>
      </div>
    </div>
  );
}