/** The four tatami squares of the logo (decorative: the name is always written next to it). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 30 30">
      <rect x="1" y="2" width="12" height="11" rx="2.5" className="fill-accent" />
      <rect x="16" y="1" width="12" height="11" rx="2.5" className="fill-accent" opacity="0.75" />
      <rect x="2" y="16" width="12" height="11" rx="2.5" className="fill-accent" opacity="0.55" />
      <rect x="17" y="15" width="12" height="11" rx="2.5" className="fill-accent" />
    </svg>
  );
}
