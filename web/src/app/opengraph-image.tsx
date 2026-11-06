import { ImageResponse } from 'next/og';

export const alt = "RI'AYA — Intelligent clinic operations";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: 'linear-gradient(135deg, #0b1f3a 0%, #0f766e 100%)',
        color: 'white',
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>RI&apos;AYA</div>
      <div style={{ fontSize: 44, marginTop: 24, maxWidth: 900 }}>
        Better care starts with a better flow.
      </div>
      <div style={{ fontSize: 28, marginTop: 32, opacity: 0.8 }}>
        Clinic scheduling and patient flow · EN · AR · FR
      </div>
    </div>,
    size,
  );
}
