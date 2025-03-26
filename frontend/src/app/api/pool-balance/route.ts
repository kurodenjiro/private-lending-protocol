import { getPoolBalance } from "@/lib/api";
import { FinalExecutionOutcome } from "@near-js/types";
import { NextResponse } from "next/server";

export async function GET() {
    const response = await getPoolBalance() as FinalExecutionOutcome;

    let poolBalance = "0";
    const status = response.status;
    if (typeof status === 'object' && 'SuccessValue' in status && status.SuccessValue) {
        const base64Value = status.SuccessValue;
        const decodedValue = Buffer.from(base64Value, 'base64').toString();
        poolBalance = JSON.parse(decodedValue);
    }
    
    return NextResponse.json({ 
        status: 'success', 
        poolBalance: poolBalance 
    });
}