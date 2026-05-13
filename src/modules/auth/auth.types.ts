export type LocalAccount = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName?: string;
  createdAt: Date;
};

export type OAuthClient = {
  id: string;
  secret: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
};

export type AccessToken = {
  token: string;
  refreshToken: string;
  accountId: string;
  clientId: string;
  scope: string;
  expiresAt: Date;
};
