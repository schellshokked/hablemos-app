import './globals.css';

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
  themeColor: '#f6f1e9',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <body>{children}</body>
    </html>
  );
}
