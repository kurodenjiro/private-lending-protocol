import { IntentRequest, fetchOptions } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    const { token_in, token_out, amount } = await req.json();
    
    const request = new IntentRequest();
    request.setAssetIn(token_in, amount);
    request.setAssetOut(token_out);

    const options = await fetchOptions(request);
    return NextResponse.json({
        status: 'success',
        quote: options[0]
    });
}   