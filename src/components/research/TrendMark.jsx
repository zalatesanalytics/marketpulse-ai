import { TrendingDown, TrendingUp, Minus } from "lucide-react";

const STYLES = {
  rising: { label: "Rising", className: "text-[hsl(88_32%_32%)]", Icon: TrendingUp },
  steady: { label: "Steady", className: "text-muted-foreground", Icon: Minus },
  cooling: { label: "Cooling", className: "text-[hsl(14_62%_38%)]", Icon: TrendingDown },
};

export default function TrendMark({ trend = "steady" }) {
  const { label, className, Icon } = STYLES[trend] || STYLES.steady;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.08em] ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}