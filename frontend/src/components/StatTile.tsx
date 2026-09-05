// One headline number on the internal pages' KPI rows (Clients, Reports):
// a small label, the figure, and an optional line of context under it.
export default function StatTile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string | number;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-100 rounded-2xl px-5 py-4 shadow-md">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-black mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {children}
    </div>
  );
}
