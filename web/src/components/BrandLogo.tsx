import Image from 'next/image';

export function BrandLogo({
  className = 'h-12 w-12',
  alt = "RI'AYA",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <span className={`overflow-hidden rounded-2xl bg-black shadow-sm ${className}`}>
      <Image
        src="/logo.png"
        alt={alt}
        width={96}
        height={96}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
