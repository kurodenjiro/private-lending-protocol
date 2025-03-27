import { getLoanStatus } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { account_id } = await req.json();

    const response = await getLoanStatus(account_id);

    // Extract and decode the base64 success value
    let loanStatus = "Unknown";
    const status = response.status;
    if (typeof status === 'object' && 'SuccessValue' in status && status.SuccessValue) {
        const base64Value = status.SuccessValue;
        const decodedValue = Buffer.from(base64Value, 'base64').toString();
        // Remove the quotes from the JSON string
        loanStatus = JSON.parse(decodedValue);
    }
    

    return NextResponse.json({
        status: 'success',
        loanStatus: loanStatus
    });
}