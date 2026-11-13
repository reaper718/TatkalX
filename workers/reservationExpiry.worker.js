const { Op } = require('sequelize');

const {
    Donation,
    DonationReservation,
    OrganizationMember,
    Notification
} = require('../models');

const INTERVAL = 60 * 1000;

let isRunning = false;

const notifyOrganizationMembers = async (
    organizationId,
    notification,
    transaction
) => {
    const members = await OrganizationMember.findAll({
        where: {
            organization_id: organizationId
        },
        attributes: ['user_id'],
        transaction
    });

    if (!members.length) return;

    const notifications = members.map(member => ({
        user_id: member.user_id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        reference_type: notification.reference_type,
        reference_id: notification.reference_id,
        is_read: false
    }));

    await Notification.bulkCreate(notifications, { transaction });
};

const notifyReservationExpired = async (
    reservation,
    donation,
    transaction
) => {
    await notifyOrganizationMembers(
        reservation.ngo_organization_id,
        {
            type: 'RESERVATION_EXPIRED',
            title: 'Reservation expired',
            message: `Your reservation for "${donation.title}" has expired.`,
            reference_type: 'DONATION_RESERVATION',
            reference_id: reservation.id
        },
        transaction
    );

    await notifyOrganizationMembers(
        donation.donor_organization_id,
        {
            type: 'RESERVATION_EXPIRED',
            title: 'Reservation expired',
            message: `An NGO reservation for "${donation.title}" has expired.`,
            reference_type: 'DONATION_RESERVATION',
            reference_id: reservation.id
        },
        transaction
    );
};

const expirePendingReservations = async () => {
    const now = new Date();

    const expiredReservations = await DonationReservation.findAll({
        where: {
            status: 'PENDING',
            expires_at: {
                [Op.lte]: now
            }
        },
        attributes: ['id'],
        order: [['expires_at', 'ASC']],
        raw: true
    });

    let expiredCount = 0;

    for (const item of expiredReservations) {
        try {
            const result = await Donation.sequelize.transaction(
                async transaction => {

                    // Read donation ID to establish the locking order.
                    const reservationInfo = await DonationReservation.findByPk(
                        item.id,
                        {
                            attributes: ['id', 'donation_id'],
                            transaction
                        }
                    );

                    if (!reservationInfo) return false;

                    const donation = await Donation.findByPk(
                        reservationInfo.donation_id,
                        {
                            transaction,
                            lock: transaction.LOCK.UPDATE
                        }
                    );

                    if (!donation) return false;

                    const reservation = await DonationReservation.findByPk(
                        item.id,
                        {
                            transaction,
                            lock: transaction.LOCK.UPDATE
                        }
                    );

                    if (!reservation) return false;

                    if (
                        reservation.status !== 'PENDING' ||
                        new Date(reservation.expires_at) > new Date()
                    ) {
                        return false;
                    }

                    await reservation.update(
                        { status: 'EXPIRED' },
                        { transaction }
                    );

                    await donation.decrement('reserved_quantity', {
                        by: Number(reservation.quantity),
                        transaction
                    });

                    await notifyReservationExpired(
                        reservation,
                        donation,
                        transaction
                    );

                    return true;
                }
            );

            if (result) expiredCount++;

        } catch (error) {
            console.error(
                `Failed to expire reservation ${item.id}:`,
                error.message
            );
        }
    }

    console.log(
        `[Reservation Expiry] Expired ${expiredCount} reservation(s).`
    );
};

const expireDonations = async () => {
    const now = new Date();

    const expiredDonations = await Donation.findAll({
        where: {
            status: 'PUBLISHED',
            pickup_deadline: {
                [Op.lte]: now
            }
        },
        attributes: ['id'],
        order: [['pickup_deadline', 'ASC']],
        raw: true
    });

    let expiredCount = 0;

    for (const item of expiredDonations) {
        try {
            const result = await Donation.sequelize.transaction(
                async transaction => {

                    // Lock donation first.
                    const donation = await Donation.findByPk(
                        item.id,
                        {
                            transaction,
                            lock: transaction.LOCK.UPDATE
                        }
                    );

                    if (!donation) return false;

                    if (
                        donation.status !== 'PUBLISHED' ||
                        new Date(donation.pickup_deadline) > new Date()
                    ) {
                        return false;
                    }

                    const pendingReservations =
                        await DonationReservation.findAll({
                            where: {
                                donation_id: donation.id,
                                status: 'PENDING'
                            },
                            order: [['id', 'ASC']],
                            transaction,
                            lock: transaction.LOCK.UPDATE
                        });

                    for (const reservation of pendingReservations) {
                        await reservation.update(
                            { status: 'EXPIRED' },
                            { transaction }
                        );

                        await notifyReservationExpired(
                            reservation,
                            donation,
                            transaction
                        );
                    }

                    await donation.update(
                        { status: 'EXPIRED' },
                        { transaction }
                    );

                    return true;
                }
            );

            if (result) expiredCount++;

        } catch (error) {
            console.error(
                `Failed to expire donation ${item.id}:`,
                error.message
            );
        }
    }

    console.log(
        `[Donation Expiry] Expired ${expiredCount} donation(s).`
    );
};

const runExpiryJobs = async () => {
    if (isRunning) {
        console.log('[Expiry Worker] Previous execution is still running.');
        return;
    }

    isRunning = true;

    try {
        console.log('[Expiry Worker] Starting expiry checks...');

        await expireDonations();
        await expirePendingReservations();

        console.log('[Expiry Worker] Expiry checks completed.');

    } catch (error) {
        console.error('[Expiry Worker] Execution failed:', error);

    } finally {
        isRunning = false;
    }
};

const startExpiryWorker = () => {
    console.log('[Expiry Worker] Started. Interval: 1 minute.');

    runExpiryJobs();

    const interval = setInterval(runExpiryJobs, INTERVAL);

    return interval;
};

if (require.main === module) {
    startExpiryWorker();
}

module.exports = {
    startExpiryWorker,
    runExpiryJobs,
    expirePendingReservations,
    expireDonations
};
