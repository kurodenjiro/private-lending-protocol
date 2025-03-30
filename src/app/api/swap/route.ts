import { intentSwap, intentWithdraw, setLoanStatus } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { address, amount, account_id, token_in, token_out, swap_type } = await req.json();

    if (!address || !amount || !token_in || !token_out || !swap_type) {
        return NextResponse.json({
            status: 'error',
            message: 'Missing required parameters. Please provide receiver address, amount, token_in, token_out, and swap_type.'
        }, { status: 400 });
    }

    // await intentDeposit(account, 'NEAR', amount);

    // First swap NEAR to ZCASH
    const swapResult = await intentSwap(token_in, amount, token_out);
    
    if (swapResult.status === 'FAILED' || !swapResult.amount_out) {
        return NextResponse.json({
            status: 'error',
            message: `Swap failed: No valid options available. Please try again.`
        }, { status: 400 });
    }

    console.log("Original amount:", swapResult.amount_out);
    let amountWithSlippage = ''
    // Calculate amount with 5% slippage tolerance
    if(token_out === 'NEAR') {
        amountWithSlippage = swapResult.amount_out;
    }else{
        const slippagePercentage = 0.05; // 5% slippage
        amountWithSlippage = (Math.floor(Number(swapResult.amount_out) * (1 - slippagePercentage))).toString();
        // console.log("Amount with slippage:", amountWithSlippage.toString());
    }
    console.log(address,token_out,amountWithSlippage);
    // Then withdraw ZCASH to the provided address with slippage-adjusted amount
    const withdrawResult = await intentWithdraw(
        address,
        token_out,
        amountWithSlippage
    );
    console.log(withdrawResult);
    // Set loan status to borrowed\
    if (swap_type === 'borrow') {
        await setLoanStatus(account_id, 'Borrowed');
    } 

    return NextResponse.json({
        status: 'success',
        swap: {
            ...swapResult,
            original_amount: token_out != 'NEAR' ? Number(swapResult.amount_out)/10**8 : swapResult.amount_out,
        },
        intentHash: withdrawResult.result.intent_hash
    });
}

