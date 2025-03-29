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

    const fetchCreditScore = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/credit-score?accountId=${account_id}`);
    const creditScore = await fetchCreditScore.json();

    await setScore(account_id, creditScore?.data?.CreditScore || 0);

    return NextResponse.json({
        status: 'success',
        score: creditScore?.data?.CreditScore || 0
    });
}