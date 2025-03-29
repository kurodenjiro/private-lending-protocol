import { NextResponse } from 'next/server';
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"


export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
        return NextResponse.json({
            status: 'error',
            message: 'accountId is required',
        }, { status: 400 });
    }

    const apiUrl = `https://pikespeak.ai/api/graph/near-transfer/${accountId}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
        return NextResponse.json({
            status: 'error',
            message: 'Failed to fetch activity history',
        }, { status: response.status });
    }

    const data = await response.json();

    const allActivities = [];
    let totalCreditScore = 0;
    let totalWeight = 0;

    for (const activity of data) {
        const accountInfoUrl = `https://pikespeak.ai/api/infos/${activity.account}`;

        // Fetch account info
        const accountInfoResponse = await fetch(accountInfoUrl);
        if (!accountInfoResponse.ok) {
            console.error(`Failed to fetch account info for account: ${activity.account}`);
            continue;
        }

        const accountInfo = await accountInfoResponse.json();

        // Calculate account age
        const timestampCreation = BigInt(accountInfo.timestamp_creation || 0);
        const now = BigInt(Date.now()) * BigInt(1_000_000); // Convert current time to nanoseconds
        const accountAge = timestampCreation ? Math.floor(Number((now - timestampCreation) / BigInt(1_000_000_000)) / (60 * 60 * 24)) : null; // Age in days

        // Determine if the account or contract is safe
        const isSafe = accountInfo.timestamp_deletion !== null;

        // Calculate credit score
        const creditScore = calculateCreditScore({
            totalIn: parseFloat(activity.totalIn),
            totalOut: parseFloat(activity.totalOut),
            accountAge: accountAge || 0, // Use 0 if accountAge is null
            isSafe,
        });

        // Add to allActivities
        allActivities.push({
            account: activity.account,
            totalIn: activity.totalIn,
            totalOut: activity.totalOut,
            accountAge: accountAge !== null ? accountAge : 'Unknown', // Return numeric value without "days"
            isSafe,
            creditScore,
        });

        // Aggregate credit score for the main accountId
        totalCreditScore += creditScore;
        totalWeight += 1; // You can use a different weight if needed
    }

    // Calculate the average credit score for the main accountId
    const CreditScore = totalWeight > 0 ? Math.round(totalCreditScore / totalWeight) : 0;

    return NextResponse.json({
        status: 'success',
        data: {
            accountId,
            CreditScore,
            allActivities,
        },
    });
}

// Helper function to calculate credit score
function calculateCreditScore({ totalIn, totalOut, accountAge, isSafe }: { totalIn: number; totalOut: number; accountAge: number; isSafe: boolean }): number {
    let score = 0;

    // Account age contribution (1 point for every 30 days, capped at 30 points)
    score += Math.min(Math.floor(accountAge / 30), 30);

    // TotalIn and TotalOut contribution (normalized ratio, capped at 40 points)
    const financialScore = totalIn > 0 ? Math.min((totalIn - totalOut) / totalIn, 1) * 40 : 0;
    score += Math.max(financialScore, 0);

    // Safety contribution (50 points if safe)
    if (isSafe) {
        score += 50;
    }

    // Ensure the score is between 0 and 100
    return Math.min(Math.max(score, 0), 100);
}