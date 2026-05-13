import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BearerStrategy } from './strategies/bearer.strategy';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'bearer' })],
  controllers: [AuthController],
  providers: [AuthService, BearerStrategy]
})
export class AuthModule {}
