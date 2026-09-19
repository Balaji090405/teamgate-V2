import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;

if (!USER_POOL_ID || !CLIENT_ID) {
  console.warn(
    'Missing Cognito configuration. Check NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID.'
  );
}

const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

/* =========================================================
   TYPES
========================================================= */

export type UserRole = 'Admin' | 'Manager' | 'Employee';

export interface AuthUser {
  email: string;
  role: UserRole;
  username: string;
}

/* =========================================================
   LOGIN
========================================================= */

export type LoginResult =
  | { type: 'SUCCESS'; session: CognitoUserSession }
  | { type: 'NEW_PASSWORD_REQUIRED'; cognitoUser: CognitoUser; userAttributes: unknown };

export function login(
  email: string,
  password: string
): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    const authenticationDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        resolve({ type: 'SUCCESS', session });
      },

      onFailure: (err) => {
        reject(err);
      },

      newPasswordRequired: (userAttributes) => {
        resolve({
          type: 'NEW_PASSWORD_REQUIRED',
          cognitoUser,
          userAttributes,
        });
      },
    });
  });
}

export function completeNewPasswordChallenge(
  cognitoUser: CognitoUser,
  newPassword: string
): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (session) => {
        resolve(session);
      },
      onFailure: (err) => {
        reject(err);
      },
    });
  });
}

/* =========================================================
   SIGN UP
========================================================= */

export function signUp(
  email: string,
  password: string
): Promise<{
  user: CognitoUser;
  userConfirmed: boolean;
}> {
  return new Promise((resolve, reject) => {
    userPool.signUp(
      email,
      password,
      [],
      [],
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        if (!result) {
          reject(new Error('Unable to create account.'));
          return;
        }

        resolve({
          user: result.user,
          userConfirmed: result.userConfirmed,
        });
      }
    );
  });
}

/* =========================================================
   CONFIRM SIGN UP
========================================================= */

export function confirmSignUp(
  email: string,
  code: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.confirmRegistration(
      code,
      true,
      (err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      }
    );
  });
}

/* =========================================================
   RESEND SIGN-UP CONFIRMATION CODE
========================================================= */

export function resendConfirmationCode(
  email: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.resendConfirmationCode((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

/* =========================================================
   FORGOT PASSWORD
========================================================= */

export function forgotPassword(
  email: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.forgotPassword({
      onSuccess: () => {
        resolve();
      },

      onFailure: (err) => {
        reject(err);
      },
    });
  });
}

/* =========================================================
   CONFIRM FORGOT PASSWORD
========================================================= */

export function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.confirmPassword(
      code,
      newPassword,
      {
        onSuccess: () => {
          resolve();
        },

        onFailure: (err) => {
          reject(err);
        },
      }
    );
  });
}

/* =========================================================
   LOGOUT
========================================================= */

export function logout(): void {
  const currentUser = userPool.getCurrentUser();

  if (currentUser) {
    currentUser.signOut();
  }
}

/* =========================================================
   GET CURRENT SESSION
========================================================= */

export function getCurrentSession(): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const currentUser = userPool.getCurrentUser();

    if (!currentUser) {
      reject(new Error('No authenticated user found.'));
      return;
    }

    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        reject(err || new Error('Unable to get user session.'));
        return;
      }

      resolve(session);
    });
  });
}

/* =========================================================
   GET CURRENT JWT TOKEN
========================================================= */

export async function getAccessToken(): Promise<string> {
  const session = await getCurrentSession();

  return session.getAccessToken().getJwtToken();
}

/* =========================================================
   GET ID TOKEN
========================================================= */

export async function getIdToken(): Promise<string> {
  const session = await getCurrentSession();

  return session.getIdToken().getJwtToken();
}

/* =========================================================
   DECODE JWT
========================================================= */

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1];

    if (!base64Url) {
      return {};
    }

    const base64 = base64Url
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((character) => {
          return (
            '%' +
            ('00' + character.charCodeAt(0).toString(16)).slice(-2)
          );
        })
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Unable to decode JWT:', error);
    return {};
  }
}

/* =========================================================
   GET ROLE FROM TOKEN
========================================================= */

export function getRoleFromToken(token: string): UserRole {
  const payload = decodeJwt(token);

  const groups = payload['cognito:groups'];

  if (Array.isArray(groups)) {
    if (groups.includes('Admin')) {
      return 'Admin';
    }

    if (groups.includes('Manager')) {
      return 'Manager';
    }
  }

  return 'Employee';
}

/* =========================================================
   GET CURRENT AUTHENTICATED USER
========================================================= */

export async function getCurrentUser(): Promise<AuthUser> {
  const session = await getCurrentSession();

  const idToken = session.getIdToken().getJwtToken();

  const payload = decodeJwt(idToken);

  const email =
    typeof payload.email === 'string'
      ? payload.email
      : '';

  const username =
    typeof payload['cognito:username'] === 'string'
      ? payload['cognito:username']
      : email;

  const groups = payload['cognito:groups'];

  let role: UserRole = 'Employee';

  if (Array.isArray(groups)) {
    if (groups.includes('Admin')) {
      role = 'Admin';
    } else if (groups.includes('Manager')) {
      role = 'Manager';
    }
  }

  return {
    email,
    username,
    role,
  };
}

/* =========================================================
   API BASE URL
========================================================= */

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/* =========================================================
   API REQUEST HELPER
========================================================= */

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_URL) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is missing from your .env.local file.'
    );
  }

  const token = await getAccessToken();

  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,

      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    }
  );

  if (!response.ok) {
    let message = 'API request failed.';

    try {
      const errorData = await response.json();

      message =
        errorData.message ||
        errorData.error ||
        message;
    } catch {
      // Keep default error message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/* =========================================================
   PROJECT API FUNCTIONS
========================================================= */

export async function getProjects() {
  return apiRequest('/projects');
}

export async function createProject(data: {
  name: string;
  description: string;
  status?: string;
}) {
  return apiRequest('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: string,
  data: {
    name?: string;
    description?: string;
    status?: string;
  }
) {
  return apiRequest(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string) {
  return apiRequest(`/projects/${id}`, {
    method: 'DELETE',
  });
}

/* =========================================================
   TEAM API FUNCTIONS
========================================================= */

export async function getTeam() {
  return apiRequest('/team');
}

export async function updateUserRole(
  userId: string,
  role: UserRole
) {
  return apiRequest(`/team/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}