import { viewLoan } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { account_id } = await req.json();

    const response = await viewLoan(account_id);

    let loanInfo = null;
    const status = response.status;
    if (typeof status === 'object' && 'SuccessValue' in status && status.SuccessValue) {
        const base64Value = status.SuccessValue;
        const decodedValue = Buffer.from(base64Value, 'base64').toString();
        // Handle the case where the response is "null"
        if (decodedValue === "null") {
            return NextResponse.json({ 
                status: 'success', 
                loan: null,
                message: 'No loan found for this account'
            });
        }
        loanInfo = JSON.parse(decodedValue);
    }

    return NextResponse.json({
        status: 'success',
        loan: loanInfo
    });
}