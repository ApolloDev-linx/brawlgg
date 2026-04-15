"use client";

export function StatBar({
  value,
  max = 100,
  color = "#5DCAA5",
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary">
      <div
        className="h-full rounded-full transition-all duration-400"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-bg-secondary rounded-lg p-4 flex-1 min-w-[120px]">
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div
        className="text-xl font-medium"
        style={{ color: color || "var(--text-primary)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-text-tertiary mt-0.5">{sub}</div>
      )}
    </div>
  );
}

export function BrawlerGrid({
  brawlers,
  selected,
  disabled,
  onSelect,
}: {
  brawlers: { id: string; name: string; iconUrl?: string | null }[];
  selected?: Set<string>;
  disabled?: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
      {brawlers.map((b) => {
        const isSelected = selected?.has(b.id);
        const isDisabled = disabled?.has(b.id);

        return (
          <button
            key={b.id}
            onClick={() => !isDisabled && onSelect(b.id)}
            disabled={isDisabled}
            className="flex flex-col items-center gap-1 p-2 rounded-lg border transition-all"
            style={{
              borderColor: isSelected
                ? "#5DCAA5"
                : "var(--border-color)",
              background: isSelected
                ? "rgba(93, 202, 165, 0.08)"
                : isDisabled
                  ? "var(--bg-tertiary)"
                  : "var(--bg-secondary)",
              opacity: isDisabled ? 0.35 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            <span className="text-xl">
              {b.iconUrl ? (
                <img
                  src={b.iconUrl}
                  alt={b.name}
                  className="w-7 h-7 object-contain"
                />
              ) : (
                b.name.slice(0, 2)
              )}
            </span>
            <span className="text-[10px] text-text-secondary truncate w-full text-center">
              {b.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search...",
  loading = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder={placeholder}
        className="flex-1 max-w-xs"
      />
      <button
        onClick={onSubmit}
        disabled={loading}
        className="px-5 rounded-lg text-sm font-medium transition-all"
        style={{
          background: "var(--text-primary)",
          color: "var(--bg-primary)",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Loading..." : "Search"}
      </button>
    </div>
  );
}
