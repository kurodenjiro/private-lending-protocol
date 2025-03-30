import React, { useState, useRef, useEffect } from 'react';
import { useWalletSelector } from './Providers';
import toast from 'react-hot-toast';
import { Wallet } from "lucide-react";

const ButtonLogin: React.FC = () => {
    const { selector, modal, accountId } = useWalletSelector();
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const hasFetchedSorce = useRef<boolean>(false);

    const handleSignIn = async () => {
        setIsLoading(true);
        try {
            modal.show();
            const subscription = modal.on("onHide", ({ hideReason }:any) => {
                if (hideReason === "wallet-navigation") {
                    // User is being redirected to wallet
                    console.log("Redirecting to wallet...");
                }
                subscription.remove();
            });
        } catch (err) {
            console.error('Failed to sign in:', err);
            toast.error('Failed to sign in');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        setIsLoading(true);
        try {
            const wallet = await selector.wallet();
            await wallet.signOut();
            window.location.reload();
        } catch (err) {
            console.error('Failed to sign out:', err);
            toast.error('Failed to sign out');
        } finally {
            setIsLoading(false);
            setIsOpen(false);
        }
    };

<<<<<<< HEAD
    const setSorceForUser = async (accountId: string) => {
        // If we've already fetched sorce or there's no accountId, don't proceed
        if (hasFetchedSorce.current || !accountId) return;

        try {
            const hasSorce = localStorage.getItem('userSorce');
            if (hasSorce) {
                hasFetchedSorce.current = true;
                return;
            }

            const response = await fetch('/api/sorce', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ account_id: accountId }),
            });

            const data = await response.json();
            if (data.status === 'success') {
                localStorage.setItem('userSorce', data.score.toString());
                hasFetchedSorce.current = true;
            }
        } catch (error) {
            console.error('Failed to set sorce:', error);
        }
    };

    // Reset the fetch flag when accountId changes
    useEffect(() => {
        if (accountId) {
            setSorceForUser(accountId);
        }
    }, [accountId]);
=======
>>>>>>> d9b40ca (update)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    if (isLoading) {
        return (
            <button
                disabled
                className="bg-blue-600 text-white px-4 py-2 rounded-lg opacity-50 cursor-not-allowed"
            >
                Loading...
            </button>
        );
    }

    if (!accountId) {
        return (
            <div className="flex items-center space-x-3">
                <button
                    onClick={handleSignIn}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm cursor-pointer flex items-center"
                >
                    <span className="hidden md:block">
                        Connect Wallet
                    </span>
                    <Wallet className="w-4 h-4 md:ml-2" />
                </button>
            </div>
        );
    }

    const formatAccountId = (id: string) => {
        if (!id) return '';
        if (id.length <= 16) return id;
        return `${id.slice(0, 8)}...${id.slice(-8)}`;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
                {formatAccountId(accountId)}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white border border-gray-200">
                    <div className="py-1">
                        <a 
                            href={`https://nearblocks.io/en/address/${accountId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            Visit Near Profile
                        </a>
                        <button
                            onClick={handleSignOut}
                            className="block w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-100 cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ButtonLogin;