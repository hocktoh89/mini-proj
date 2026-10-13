// Permission codes for administering access itself. Holders can only hand out permissions they
// hold, so neither can be used to escalate past the admin's own role.
// Create roles, edit them and choose which permissions each role grants.
export const ROLES_MANAGE = 'roles.manage';
// Give users a role, change it or take it away.
export const USER_ROLES_ASSIGN = 'userRoles.assign';
