import { Siren } from 'lucide-react';
import { typeToken, useTypeLabel } from './appointmentTypes';

/** Appointment type: colour swatch + name (+ emergency icon), never colour alone. */
export function TypeChip({
  type,
  typeName,
  typeColor,
}: {
  type: string;
  typeName?: string | null;
  typeColor?: string | null;
}) {
  const label = useTypeLabel()(type, typeName);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: typeToken(typeColor, type) }}
      />
      {type === 'EMERGENCY' ? <Siren size={13} aria-hidden="true" className="text-alert" /> : null}
      {label}
    </span>
  );
}
