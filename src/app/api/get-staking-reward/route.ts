import { getStakingRewards } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { account_id } = await req.json();

    const response = await getStakingRewards(account_id);

    let balance = "0";
    const status = response.status;
    if (typeof status === 'object' && 'SuccessValue' in status && status.SuccessValue) {
        const base64Value = status.SuccessValue;
        const decodedValue = Buffer.from(base64Value, 'base64').toString();
        balance = JSON.parse(decodedValue);
    }

    return NextResponse.json({
        status: 'success',
        balance: balance
    });
}