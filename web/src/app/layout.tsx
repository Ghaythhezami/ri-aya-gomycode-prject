import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SITE_URL } from '@/lib/site';

// Resolves root-level metadata files (opengraph-image, icons) to absolute URLs.
export const metadata: Metadata = { metadataBase: new URL(SITE_URL) };

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
