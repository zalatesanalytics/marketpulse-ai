// Brands a visitor can pick instead of typing, so the desk always gets a clean name.
const FOOTWEAR_BRANDS = [
  "Nike",
  "Adidas",
  "Jordan",
  "Puma",
  "New Balance",
  "Asics",
  "Reebok",
  "Under Armour",
  "Converse",
  "Vans",
  "Hoka",
  "On Running",
  "Salomon",
  "Skechers",
];

const QUESTIONS = ["How does sentiment scoring work?", "Which platforms should I start with?"];

export default function BrandPicker({ onPick, disabled = false }) {
  return (
    <div className="space-y-2.5 px-4 pb-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        Footwear brands — pick one to start
      </p>

      <div className="flex flex-wrap gap-1.5">
        {FOOTWEAR_BRANDS.map((brand) => (
          <button
            key={brand}
            type="button"
            onClick={() => onPick(brand)}
            disabled={disabled}
            className="rounded-full border border-border bg-background px-2.5 py-1.5 text-[11.5px] leading-tight text-foreground transition-colors hover:border-foreground/40 hover:bg-secondary disabled:opacity-50"
          >
            {brand}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            disabled={disabled}
            className="text-[11px] text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}