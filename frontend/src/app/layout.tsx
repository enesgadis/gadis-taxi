import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaxiFlow | WP + Telegram Taksi',
  description: 'Konum bazlı taksi, randevu ve 1 saat hatırlatma',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
