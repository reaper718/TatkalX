require('dotenv').config({ path: '.env.test' });
const crypto = require('crypto');
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const API_URL = process.env.API_URL;
const donationId = process.env.DONATION_ID;

const ngos = [
    { name: 'NGO A', token: process.env.NGO_A_TOKEN, quantity: 50 },
    { name: 'NGO B', token: process.env.NGO_B_TOKEN, quantity: 40 },
    { name: 'NGO C', token: process.env.NGO_C_TOKEN, quantity: 30 }
];

async function requestReservation(ngo) {
    try {
        const idempotencyKey = crypto.randomUUID();

        const response = await axios.post(
            `${API_URL}/donations/${donationId}/reservations`,
            { quantity: ngo.quantity },
            {
                headers: {
                    Authorization: `Bearer ${ngo.token}`,
                    'Idempotency-Key': idempotencyKey
                }
            }
        );

        return {
            ngo: ngo.name,
            requested: ngo.quantity,
            success: true,
            status: response.status,
            response: response.data
        };

    } catch (error) {
        return {
            ngo: ngo.name,
            requested: ngo.quantity,
            success: false,
            status: error.response?.status,
            response: error.response?.data || error.message
        };
    }
}

async function verifyDonation() {
    const result = await pool.query(
        `SELECT
            id,
            total_quantity,
            reserved_quantity,
            allocated_quantity,
            (reserved_quantity + allocated_quantity) AS committed_quantity
         FROM donations
         WHERE id = $1`,
        [donationId]
    );

    const donation = result.rows[0];

    if (!donation) {
        throw new Error('Donation not found.');
    }

    console.table(donation);

    const total = Number(donation.total_quantity);
    const reserved = Number(donation.reserved_quantity);
    const allocated = Number(donation.allocated_quantity);

    if (reserved + allocated > total) {
        throw new Error('FAILED: Quantity limit exceeded!');
    }

    console.log('PASSED: Quantity limit maintained.');
}

async function runTest() {
    try {
        console.log('Starting concurrent reservation test...');

        // All three requests are initiated together.
        const results = await Promise.all(
            ngos.map(requestReservation)
        );

        console.table(
            results.map(result => ({
                NGO: result.ngo,
                Requested: result.requested,
                Success: result.success,
                HTTP: result.status,
                Error: JSON.stringify(result.response)
            }))
        );

        console.log('\nVerifying database counters...');
        await verifyDonation();

        console.log('\nConcurrent reservation test completed.');

    } catch (error) {
        console.error('Test failed:', error.message);

    } finally {
        await pool.end();
    }
}

runTest();
