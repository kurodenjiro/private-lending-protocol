import { NextResponse } from 'next/server';

// Local function to interact with the NEAR blockchain
async function getCreditFromAccount(account_id: string) {
    // Simulate a call to the NEAR blockchain
    // Replace this with actual NEAR API interaction logic
    try {
        const baseUrl = 'https://api.nearblocks.io/v1/account/kurodenjiro.near/activities';
        let cursor: string | null = null;
        let allActivities: any[] = [];

        do {
            const apiUrl: string = cursor ? `${baseUrl}?cursor=${cursor}` : baseUrl;

            // Fetch data from the external API
            const response = await fetch(apiUrl);
            if (!response.ok) {
                return NextResponse.json({
                    status: 'error',
                    message: 'Failed to fetch activity history',
                }, { status: response.status });
            }

            const data = await response.json();

            // Append activities to the list
            allActivities = allActivities.concat(data.activities);

            // Update the cursor for the next iteration
            cursor = data.cursor || null;
        } while (cursor);

        // Return the aggregated activities
        return NextResponse.json({
            status: 'success',
            activities: allActivities,
        });
    } catch (error) {
        console.error('Error fetching activity history:', error);
        return NextResponse.json({
            status: 'error',
            message: 'An unexpected error occurred',
        }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const account_id = searchParams.get('account_id');

        if (!account_id) {
            return NextResponse.json({
                status: 'error',
                message: 'account_id is required',
            }, { status: 400 });
        }

        // Call the local function to calculate credit from NEAR blockchain
        const response = await getCreditFromAccount(account_id);

        let credit = "0";
        const status = response.status;
        if (typeof status === 'object' && 'SuccessValue' in status && status.SuccessValue) {
            const base64Value = status.SuccessValue;
            const decodedValue = Buffer.from(base64Value, 'base64').toString();
            credit = JSON.parse(decodedValue);
        }

        return NextResponse.json({
            status: 'success',
            credit: credit,
        });
    } catch (error) {
        console.error('Error calculating credit:', error);
        return NextResponse.json({
            status: 'error',
            message: 'Failed to calculate credit',
        }, { status: 500 });
    }
}