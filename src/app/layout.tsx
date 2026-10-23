import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'עד 120 | תוצאות הבחירות לכנסת',
  description: 'לוח תוצאות בחירות עצמאי, חלוקת מנדטים בשיטת בדר–עופר, הסכמי עודפים ותרחישי קולות.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
