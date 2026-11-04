/** Model silhouettes for printer identification; no telemetry is implied. */
export function PrinterGlyph({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const openFrame = /a1/i.test(name);
  return (
    <svg
      viewBox="0 0 64 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {openFrame ? (
        <>
          <path d="M15 9h8v54h-8zM10 63h44v8H10zM23 22h32v7H23M46 29v15M40 44h12M34 48h23v5H26M23 14h9v8M47 17v5" />
          <path
            d="M31 48v-7h13v7M32 71v4M48 71v4M15 71v4M19 14v44"
            opacity=".5"
          />
          <circle cx="51" cy="11" r="7" />
          <circle cx="51" cy="11" r="2" />
        </>
      ) : (
        <>
          <path d="M9 12 17 5h30l8 7v59H9zM9 12h46M15 19h34v43H15zM20 26h24M27 26v10h10V26M32 36v7M22 53h20M25 53l3-10h8l3 10M14 71v4M50 71v4" />
          <path d="M20 19v37h24V19M49 40h3M18 8h28" opacity=".5" />
          <rect x="37" y="64" width="12" height="4" rx="1" />
        </>
      )}
    </svg>
  );
}
