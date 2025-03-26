import { setScore } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        status: 'success',
        sorce:1000
    });
}

export async function POST(req: Request) {
    const { account_id } = await req.json();

    await setScore(account_id, 1000);

    return NextResponse.json({
        status: 'success',
        score: 1000
    });
}