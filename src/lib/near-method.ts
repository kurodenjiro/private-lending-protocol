interface CallMethodArgs {
  accountId: string;
  selector: any;
  contractId: string;
  method: string;
  args: any;
  options?: CallMethodOptions;
}

interface CallMethodOptions {
  gas?: string;
  deposit?: string;
  callbackUrl?: string;
  attached_deposit?: string;
}

export const CallMethod = async ({accountId,selector,contractId,method,args,options}: CallMethodArgs) => {
    try {
      
      if (!accountId) {
        throw new Error("Please connect wallet first");
      }

      // Helper function to convert NEAR to yoctoNEAR
      const parseNearAmount = (amount: string | number): string => {
        const NEAR_NOMINATION = 24;
        const amountFloat = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(amountFloat)) return '0';
        return (BigInt(Math.round(amountFloat * Math.pow(10, NEAR_NOMINATION)))).toString();
      };

      const wallet = await selector.wallet();
      const transaction = {
        receiverId: contractId,
        callbackUrl: options?.callbackUrl,
        actions: [{
          type: 'FunctionCall',
          params: {
            methodName: method,
            args: args,
            gas: options?.gas || '30000000000000',
            deposit: options?.deposit ? parseNearAmount(options.deposit) : options?.attached_deposit ? options.attached_deposit : '0'
          }
        }]
      };
  
      const result = await wallet.signAndSendTransaction(transaction as any);
      
      return result;
    } catch (error) {
      console.error('CallMethod error:', error);
      throw error;
    }
  };