import {
  adminLoginIntro,
  emergencyAdminIdFromEnv,
  emergencyLoginHint,
  orgNameFromEnv,
  pollAppTitle,
  shellLoginFailureCopy,
  shellSsoEnabledFromEnv,
} from './org';

export const orgName = orgNameFromEnv(import.meta.env.VITE_ORG_NAME);
export const emergencyAdminId = emergencyAdminIdFromEnv(import.meta.env.VITE_EMERGENCY_ADMIN_ID);
export const shellSsoEnabled = shellSsoEnabledFromEnv(import.meta.env.VITE_SHELL_SSO_ENABLED);
export const pollTitle = pollAppTitle(orgName);
export const adminIntro = adminLoginIntro(orgName, shellSsoEnabled);
export const emergencyHint = emergencyLoginHint(orgName, shellSsoEnabled);
export const shellFailureCopy = shellLoginFailureCopy(orgName);
