import { WalletSelectorContextProvider } from "./Providers";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <WalletSelectorContextProvider>
      {children}
    </WalletSelectorContextProvider>
  );
}