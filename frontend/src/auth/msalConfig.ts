// src/auth/msalConfig.ts
import { Configuration, LogLevel } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_APP_CLIENT_ID as string;
const tenantId = import.meta.env.VITE_TENANT_ID as string;

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
        if (level === LogLevel.Warning) console.warn(message);
      },
    },
  },
};

// Scopes requested for the Policy Hub API
export const apiScopes = [`api://${clientId}/Policies.Read`];

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', ...apiScopes],
};
