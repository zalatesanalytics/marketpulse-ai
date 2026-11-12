export default function Snippet({ children }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-secondary px-3.5 py-3 font-mono text-[11.5px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}