import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import './globals.css';

// Designed for low-vision readers: clear letterforms and accents (ñ, á, ü) at any size.
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-read',
});

export const metadata = {
  title: 'Hablemos',
  description: 'English ⇄ Honduran Spanish, face to face',
  manifest: '/manifest.json',
  // Stop Chrome/Safari from auto-translating the page (it breaks React).
  other: { google: 'notranslate' },
  appleWebApp: { capable: true, title: 'Hablemos', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#E8EFEC',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" translate="no" className={`notranslate ${atkinson.variable}`}>
      <body>{children}</body>
    </html>
  );
}
