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
    // Then withdraw ZCASH to the provided address with slippage-adjusted amount
    const withdrawResult = await intentWithdraw(
        receiver_address,
        'ZCASH',
        swapResult.amount_out
    );

    // Set loan status to borrowed
    await setLoanStatus(account_id, 'Borrowed');

    return NextResponse.json({
        status: 'success',
        swap: {
            ...swapResult,
            original_amount: Number(swapResult.amount_out)/10**8,
        },
        withdraw: withdrawResult,
        intentHash: withdrawResult.result.intent_hash
    });
}

