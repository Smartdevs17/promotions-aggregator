import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Promotions Aggregator',
  description: 'Live promotions from The Promenade Shops at Briargate',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
