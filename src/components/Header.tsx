'use client';

import Link from 'next/link';
import ButtonLogin from './LoginButton';

const Header = () => {

  return (
    <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-gray-800">
              Citadel On Chain
            </Link>
            <nav className="hidden md:flex space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/staking" className="text-gray-600 hover:text-gray-900">
                Staking
              </Link>
            </nav>
          </div>
          <ButtonLogin />
        </div>
      </div>
    </header>
  );
};

export default Header; 