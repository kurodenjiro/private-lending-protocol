import { NextRequest, NextResponse } from "next/server";
import { checkStatus } from "@/lib/api";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const intentHash = searchParams.get('intentHash');
    if(!intentHash) {
        return NextResponse.json({
            status: 'error',
            message: 'Intent hash is required'
        }, { status: 400 });
    }
    const status = await checkStatus(intentHash);
    return NextResponse.json({
        status: status?.result
    });
}