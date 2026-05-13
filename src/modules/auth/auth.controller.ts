import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
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
    });
  }

  @Get('oauth/introspect')
  introspect(@Headers('authorization') authHeader?: string) {
    const token = this.extractToken(authHeader);
    const access = this.authService.validateBearerToken(token);
    return {
      active: true,
      client_id: access.clientId,
      username: access.accountId,
      scope: access.scope,
      exp: Math.floor(access.expiresAt.getTime() / 1000),
    };
  }

  private extractToken(authHeader?: string) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    return authHeader.slice('Bearer '.length);
  }
}
