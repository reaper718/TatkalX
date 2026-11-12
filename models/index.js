const User = require('./Users');
const Organization = require('./Organizations');
const OrganizationMember = require('./Organozation_members');
const Donation = require('./Donations');
const DonationReservation = require('./Donation_reservations');
const Allocation = require('./allocation');
const AllocationEvent = require('./Allocation_events');
const Notification = require('./Notifications');
const AuditLog = require('./AuditLogs');
const IdempotencyKey = require('./IdempotencyKey');

User.hasMany(OrganizationMember, {
    foreignKey: 'user_id',
    as: 'organizationMemberships'
});

OrganizationMember.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

Organization.hasMany(OrganizationMember, {
    foreignKey: 'organization_id',
    as: 'memberships'
});

OrganizationMember.belongsTo(Organization, {
    foreignKey: 'organization_id',
    as: 'organization'
});

User.belongsToMany(Organization, {
    through: OrganizationMember,
    foreignKey: 'user_id',
    otherKey: 'organization_id',
    as: 'organizations'
});

Organization.belongsToMany(User, {
    through: OrganizationMember,
    foreignKey: 'organization_id',
    otherKey: 'user_id',
    as: 'users'
});

Organization.hasMany(Donation, {
    foreignKey: 'donor_organization_id',
    as: 'donations'
});

Donation.belongsTo(Organization, {
    foreignKey: 'donor_organization_id',
    as: 'donorOrganization'
});

Donation.hasMany(DonationReservation, {
    foreignKey: 'donation_id',
    as: 'reservations'
});

DonationReservation.belongsTo(Donation, {
    foreignKey: 'donation_id',
    as: 'donation'
});

Organization.hasMany(DonationReservation, {
    foreignKey: 'ngo_organization_id',
    as: 'ngoReservations'
});

DonationReservation.belongsTo(Organization, {
    foreignKey: 'ngo_organization_id',
    as: 'ngoOrganization'
});

DonationReservation.hasOne(Allocation, {
    foreignKey: 'reservation_id',
    as: 'allocation'
});

Allocation.belongsTo(DonationReservation, {
    foreignKey: 'reservation_id',
    as: 'reservation'
});

Allocation.hasMany(AllocationEvent, {
    foreignKey: 'allocation_id',
    as: 'events'
});

AllocationEvent.belongsTo(Allocation, {
    foreignKey: 'allocation_id',
    as: 'allocation'
});

User.hasMany(AllocationEvent, {
    foreignKey: 'changed_by',
    as: 'allocationEvents'
});

AllocationEvent.belongsTo(User, {
    foreignKey: 'changed_by',
    as: 'changedBy'
});

User.hasMany(Notification, {
    foreignKey: 'user_id',
    as: 'notifications'
});

Notification.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

User.hasMany(AuditLog, {
    foreignKey: 'actor_user_id',
    as: 'auditLogs'
});

AuditLog.belongsTo(User, {
    foreignKey: 'actor_user_id',
    as: 'actor'
});

User.hasMany(IdempotencyKey, {
    foreignKey: 'user_id',
    as: 'idempotencyKeys'
});

IdempotencyKey.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

module.exports = {
    User,
    Organization,
    OrganizationMember,
    Donation,
    DonationReservation,
    Allocation,
    AllocationEvent,
    Notification,
    AuditLog,
    IdempotencyKey
};
