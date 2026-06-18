import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@golden-abode/types';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.usersService.findById(payload.sub);
    console.log('JWT Validate - payload.sub:', payload.sub);
    console.log('JWT Validate - user found:', !!user);
    if (user) {
      console.log('JWT Validate - user.isActive:', user.isActive);
      console.log('JWT Validate - user plain object:', user.get({ plain: true }));
    }
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }
    return { sub: payload.sub, role: payload.role };
  }
}
