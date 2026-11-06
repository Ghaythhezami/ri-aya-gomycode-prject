export function SectionHeading({
  kicker,
  title,
  subtitle,
  align = 'center',
  tone = 'dark',
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  align?: 'center' | 'start';
  tone?: 'dark' | 'light';
}) {
  const light = tone === 'light';

  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      <p
        className={`text-xs font-semibold tracking-[0.18em] uppercase ${
          light ? 'text-[#7fdccc]' : 'text-primary'
        }`}
      >
        {kicker}
      </p>
      <h2
        className={`mt-4 text-3xl leading-tight font-bold tracking-tight sm:text-4xl ${
          light ? 'text-white' : 'text-navy'
        }`}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className={`mt-4 text-lg leading-relaxed ${light ? 'text-white/70' : 'text-muted'}`}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
