import { MODALITIES } from "@/lib/modalities";

// The modalities an agent says it took in, as a row of checkboxes: ticked ones lit, the rest dimmed.
export default function Modalities({ judgedOn }: { judgedOn: string[] | null }) {
  if (!judgedOn?.length) return <p className="ag-mods-none">Didn&apos;t say what it took in</p>;
  const used = new Set(judgedOn);
  return (
    <ul className="ag-mods" aria-label={`Took in: ${MODALITIES.filter((m) => used.has(m.key)).map((m) => m.label).join(", ")}`}>
      {MODALITIES.map((m) => {
        const on = used.has(m.key);
        return (
          <li key={m.key} className={on ? "on" : undefined} aria-hidden="true">
            <span className="ag-box">{on ? "✓" : ""}</span>
            <span className="ag-mod-icon">{m.icon}</span>
            {m.label}
          </li>
        );
      })}
    </ul>
  );
}
