interface SignatureValue {
  typedSignature: string | null;
  printedName: string | null;
  date: string | null;
}

interface DocuSignSignerFieldsProps {
  label: string;
  value: SignatureValue;
  onChange: (next: SignatureValue) => void;
}

export function DocuSignSignerFields({ label, value, onChange }: DocuSignSignerFieldsProps) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-mute">{label}</p>
      <p className="mt-2 text-sm text-mute">
        The signature and signing date will be captured in DocuSign.
      </p>
      <label className="mt-3 block max-w-xl">
        <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Printed Name</span>
        <input
          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
          type="text"
          value={value.printedName ?? ''}
          onChange={(event) => onChange({ ...value, printedName: event.target.value })}
        />
      </label>
    </div>
  );
}
