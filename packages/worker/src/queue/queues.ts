// Logical queue names. Business code references these constants, never raw
// strings, so a typo is a compile error.
export const QUEUES = {
  default: 'hrms-default',
  notifications: 'hrms-notifications',
} as const;
