import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TeamGate',
  description: 'Role-based project tracker',
};

const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('teamgate-theme') || 'system';
      var root = document.documentElement;
      root.classList.remove('dark', 'theme-indigo', 'theme-emerald', 'theme-amber');
      
      if (t === 'dark') {
        root.classList.add('dark');
      } else if (t === 'theme-indigo') {
        root.classList.add('dark', 'theme-indigo');
      } else if (t === 'theme-emerald') {
        root.classList.add('dark', 'theme-emerald');
      } else if (t === 'theme-amber') {
        root.classList.add('dark', 'theme-amber');
      } else if (t === 'system') {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
        }
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}