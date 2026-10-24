export function BrandLogo({
  className = 'h-12 w-12',
  alt = "RI'AYA",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <span className={`overflow-hidden rounded-2xl bg-black shadow-sm ${className}`}>
      <img src="/logo.png" alt={alt} className="h-full w-full object-cover" />
    </span>
  );
}
