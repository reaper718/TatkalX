const { Notification } = require('../../models');

const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user.id;

        const page = Math.max(
            Number.parseInt(req.query.page, 10) || 1,
            1
        );

        const limit = Math.min(
            Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
            50
        );

        const offset = (page - 1) * limit;

        const { count, rows } = await Notification.findAndCountAll({
            where: {
                user_id: userId
            },

            attributes: [
                'id',
                'type',
                'title',
                'message',
                'reference_type',
                'reference_id',
                'is_read',
                'createdAt'
            ],

            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            success: true,
            message: 'Notifications fetched successfully.',

            pagination: {
                totalItems: count,
                currentPage: page,
                totalPages,
                limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            },

            data: rows.map(notification => ({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                referenceType: notification.reference_type,
                referenceId: notification.reference_id,
                isRead: notification.is_read,
                createdAt: notification.createdAt
            }))
        });

    } catch (error) {
        console.error('Get notifications error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to fetch notifications.',
            error: error.message
        });
    }
};

const markNotificationAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const notification = await Notification.findOne({
            where: {
                id,
                user_id: userId
            }
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found.'
            });
        }

        if (notification.is_read) {
            return res.status(200).json({
                success: true,
                message: 'Notification is already marked as read.'
            });
        }

        await notification.update({
            is_read: true
        });

        return res.status(200).json({
            success: true,
            message: 'Notification marked as read.',
            data: {
                id: notification.id,
                isRead: notification.is_read
            }
        });

    } catch (error) {
        console.error('Mark notification as read error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to mark notification as read.',
            error: error.message
        });
    }
};

const markAllNotificationsAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        const [updatedCount] = await Notification.update(
            {
                is_read: true
            },
            {
                where: {
                    user_id: userId,
                    is_read: false
                }
            }
        );

        return res.status(200).json({
            success: true,
            message: 'All notifications marked as read.',
            updatedCount
        });

    } catch (error) {
        console.error('Mark all notifications as read error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to mark all notifications as read.',
            error: error.message
        });
    }
};

module.exports = {
    getMyNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
};
