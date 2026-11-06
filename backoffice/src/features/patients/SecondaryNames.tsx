import type { LocalizedText } from '@riaya/shared';
import { otherSpellings } from './names';

const ARABIC = /[؀-ۿ]/;

/** Other-language spellings of a name as secondary text, each in its own direction. */
export function SecondaryNames({
  first,
  last,
  shown,
  className = 'mt-0.5 text-sm text-muted',
}: {
  first: LocalizedText | undefined;
  last: LocalizedText | undefined;
  shown: string;
  className?: string;
}) {
  const spellings = otherSpellings(first, last, shown);
  if (spellings.length === 0) return null;
  return (
    <p className={className} data-testid="secondary-names">
      {spellings.map((s, i) => (
        <span key={s}>
          {i > 0 ? ' · ' : ''}
          <span lang={ARABIC.test(s) ? 'ar' : undefined} dir="auto">
            {s}
          </span>
        </span>
      ))}
    </p>
  );
}
