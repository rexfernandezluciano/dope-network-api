import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-strategy';
import type { Request } from 'express';
import { AuthService } from '../auth.service';

class BearerTokenStrategy extends Strategy {
  name = 'bearer';

  constructor(private readonly authService: AuthService) {
    super();
  }

  async authenticate(req: Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return (this as any).fail({ message: 'missing bearer token' }, 401);
    }

    const token = authHeader.slice('Bearer '.length);
    try {
      const access = await this.authService.validateBearerToken(token);
      return (this as any).success(access);
    } catch {
      return (this as any).fail({ message: 'invalid token' }, 401);
    }
  }
}

@Injectable()
export class BearerStrategy extends PassportStrategy(BearerTokenStrategy, 'bearer') {
  constructor(authService: AuthService) {
    super(authService);
  }

  validate(user: unknown) {
    return user;
  }
}
