export function BrandMark({ className = 'h-11 w-11' }: { className?: string }) {
  return <img src="/riaya-mark.png" alt="" aria-hidden className={`object-contain ${className}`} />;
}

export function BrandLogo({
  tone,
  className,
  alt = "RI'AYA",
}: {
  tone?: 'dark' | 'light';
  className?: string;
  alt?: string;
}) {
  // Square image logo (main's API): used when sized via className without a tone.
  if (className !== undefined && tone === undefined) {
    return (
      <span className={`overflow-hidden rounded-2xl bg-black shadow-sm ${className}`}>
        <img src="/logo.png" alt={alt} className="h-full w-full object-cover" />
      </span>
    );
  }

  const light = tone === 'light';

  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] ${
          light ? 'bg-white shadow-[0_6px_16px_rgba(0,0,0,0.2)]' : ''
        }`}
      >
        <BrandMark className={light ? 'h-8 w-8' : 'h-11 w-11'} />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={`text-[19px] font-bold tracking-tight ${light ? 'text-white' : 'text-navy'}`}
        >
          Ri’aya
        </span>
        <span
          lang="ar"
          className={`mt-1 text-[11px] font-semibold ${light ? 'text-white/60' : 'text-primary'}`}
        >
          رعاية
        </span>
      </span>
    </span>
  );
}
