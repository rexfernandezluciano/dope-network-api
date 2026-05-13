import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/register')
  register(@Body() body: { username: string; email: string; password: string; displayName?: string }) {
    return this.authService.register(body);
  }

  @Post('auth/login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }


  @Post('oauth/clients')
  createOAuthClient(
    @Body()
    body: {
      client_id: string;
      name: string;
      redirect_uris: string[];
      scopes: string[];
    },
  ) {
    return this.authService.createOAuthClient({
      id: body.client_id,
      name: body.name,
      redirectUris: body.redirect_uris,
      scopes: body.scopes,
    });
  }

  @Post('oauth/token')
  oauthToken(
    @Body()
    body: {
      grant_type: string;
      client_id: string;
      client_secret: string;
      scope?: string;
      username?: string;
      password?: string;
      refresh_token?: string;
      nonce?: string;
    },
  ) {
    return this.authService.oauthToken({
      grantType: body.grant_type,
      clientId: body.client_id,
      clientSecret: body.client_secret,
      scope: body.scope,
      username: body.username,
      password: body.password,
      refreshToken: body.refresh_token,
      nonce: body.nonce,
    });
  }


  @Get('.well-known/openid-configuration')
  openidConfiguration(@Req() req: { protocol: string; headers: { host?: string } }) {
    const issuer = process.env.OIDC_ISSUER ?? `${req.protocol}://${req.headers.host ?? 'localhost:3000'}`;
    return this.authService.getOpenIdConfiguration(issuer);
  }

  @UseGuards(AuthGuard('bearer'))
  @Get('oauth/userinfo')
  userInfo(@Req() req: { user: any }) {
    return this.authService.userInfoFromAccess(req.user);
  }

  @UseGuards(AuthGuard('bearer'))
  @Get('oauth/introspect')
  async introspect(@Req() req: { user: any }) {
    const access = req.user;
    return {
      active: true,
      client_id: access.clientId,
      username: access.user?.username ?? null,
      scope: access.scope,
      exp: Math.floor(access.expiresAt.getTime() / 1000),
    };
  }
}
