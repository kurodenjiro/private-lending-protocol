import { intentSwap, intentWithdraw, setLoanStatus } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { receiver_address, amount, account_id } = await req.json();

    if (!receiver_address || !amount) {
        return NextResponse.json({
            status: 'error',
            message: 'Missing required parameters. Please provide receiver address and amount.'
        }, { status: 400 });
    }

    // await intentDeposit(account, 'NEAR', amount);

    // First swap NEAR to ZCASH
    const swapResult = await intentSwap('NEAR', amount, 'ZCASH');
    
    if (swapResult.status === 'FAILED' || !swapResult.amount_out) {
        return NextResponse.json({
            status: 'error',
            message: `Swap failed: No valid options available.`
        }, { status: 400 });
    }

    console.log("Original amount:", swapResult.amount_out);
    
    // Calculate amount with 5% slippage tolerance
    const slippagePercentage = 0.05; // 5% slippage
    const amountWithSlippage = Math.floor(Number(swapResult.amount_out) * (1 - slippagePercentage));
    console.log("Amount with slippage:", amountWithSlippage);

    // Then withdraw ZCASH to the provided address with slippage-adjusted amount
    const withdrawResult = await intentWithdraw(
        receiver_address,
        'ZCASH',
        amountWithSlippage.toString()
    );

    // Set loan status to borrowed
    await setLoanStatus(account_id, 'Borrowed');

    return NextResponse.json({
        status: 'success',
        swap: {
            ...swapResult,
            original_amount: Number(swapResult.amount_out)/10**8,
        },
        intentHash: withdrawResult.result.intent_hash
    });
}

