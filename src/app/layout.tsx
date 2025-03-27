import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Header from '@/components/Header';
import Layout from '@/components/Layout';
import "@near-wallet-selector/modal-ui/styles.css"
import { Toaster } from 'react-hot-toast';
const inter = Inter({ subsets: ['latin'] });
import "@near-wallet-selector/modal-ui/styles.css"

export const metadata: Metadata = {
  title: 'Citadel On Chain Platform',
  description: 'Lending, Borrowing, and Staking on NEAR Protocol',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Layout>
          <Header />
          {children}
        </Layout>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
