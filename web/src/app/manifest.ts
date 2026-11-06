import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RI'AYA — Intelligent clinic operations",
    short_name: "RI'AYA",
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f9fc',
    theme_color: '#0f766e',
    icons: [{ src: '/logo.png', sizes: '1254x1254', type: 'image/png' }],
  };
}
