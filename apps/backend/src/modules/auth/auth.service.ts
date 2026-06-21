import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import * as crypto from 'crypto';

import { Role, JwtPayload } from '@golden-abode/types';
import { UsersService } from '../users/users.service';
import { RedisService } from '../../core/redis/redis.service';
import { RefreshToken } from '../users/models/refresh-token.model';
import { User } from '../users/models/user.model';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    private redisService: RedisService,
    @InjectModel(RefreshToken)
    private refreshTokenModel: typeof RefreshToken,
  ) {}

  // ─── Send OTP ─────────────────────────────────────────────────────────

  async sendOtp(dto: SendOtpDto): Promise<{ message: string }> {
    const { phone } = dto;

    // Rate limiting check (Redis-based)
    const rateLimitKey = `otp_rate:${phone}`;
    const attempts = await this.redisService.get(rateLimitKey);
    const maxSends = this.configService.get<number>('throttle.otpSendLimit', 3);
    const rateTtl = this.configService.get<number>('throttle.otpSendTtl', 3600);

    if (attempts && parseInt(attempts, 10) >= maxSends) {
      throw new BadRequestException(`OTP send limit exceeded. Try again after some time.`);
    }

    const env = this.configService.get<string>('env', 'development');
    
    // Generate 6-digit OTP (hardcoded to 123456 in development for easier testing)
    const otp = env === 'development' ? '123456' : crypto.randomInt(100000, 999999).toString();

    // Hash the OTP and store in Redis with 5 minute TTL
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const otpKey = `otp:${phone}`;
    await this.redisService.set(otpKey, hashedOtp, 300); // 5 minutes

    // Increment rate limit counter
    const currentCount = attempts ? parseInt(attempts, 10) : 0;
    await this.redisService.set(rateLimitKey, (currentCount + 1).toString(), rateTtl);

    if (env === 'development') {
      this.logger.warn(`[DEV MODE] OTP for ${phone}: ${otp}`);
      // Return the OTP in the response body so the app dev can easily copy or auto-fill it
      return { message: 'OTP sent successfully (DEV MODE)', devOtp: otp };
    } else {
      // Production: call MSG91 API
      await this.sendViaMSG91(phone, otp);
      return { message: 'OTP sent successfully' };
    }
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, otp } = dto;

    // Check verify attempt rate limit
    const verifyRateKey = `otp_verify_rate:${phone}`;
    const verifyAttempts = await this.redisService.get(verifyRateKey);
    const maxVerifyAttempts = this.configService.get<number>('throttle.otpVerifyLimit', 5);
    const verifyTtl = this.configService.get<number>('throttle.otpVerifyTtl', 600);

    if (verifyAttempts && parseInt(verifyAttempts, 10) >= maxVerifyAttempts) {
      throw new BadRequestException('Too many verification attempts. Try again later.');
    }

    // Fetch stored hash from Redis
    const otpKey = `otp:${phone}`;
    const storedHash = await this.redisService.get(otpKey);

    if (!storedHash) {
      throw new UnauthorizedException('OTP expired or not found. Request a new one.');
    }

    // Compare OTP
    const incomingHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (incomingHash !== storedHash) {
      // Increment verify attempt counter
      const currentAttempts = verifyAttempts ? parseInt(verifyAttempts, 10) : 0;
      await this.redisService.set(verifyRateKey, (currentAttempts + 1).toString(), verifyTtl);
      throw new UnauthorizedException('Invalid OTP');
    }

    // OTP valid — delete it (single-use)
    await this.redisService.del(otpKey);
    await this.redisService.del(verifyRateKey);

    // Check if user exists
    const existingUser = await this.usersService.findByPhone(phone);

    if (existingUser) {
      // Existing user → generate tokens and return login response
      const tokens = await this.generateTokenPair(existingUser);
      return {
        isNewUser: false,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.sanitizeUser(existingUser),
      };
    }

    // New user → issue onboarding token
    const onboardingToken = this.jwtService.sign(
      { phone },
      {
        secret: this.configService.get<string>('jwt.onboardingSecret'),
        expiresIn: this.configService.get<string>('jwt.onboardingExpiresIn', '15m'),
      },
    );

    return {
      isNewUser: true,
      onboardingToken,
    };
  }

  // ─── Register ─────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const { onboardingToken, name, role } = dto;

    // Block ADMIN self-registration
    if (role === Role.ADMIN) {
      throw new BadRequestException('ADMIN role cannot be self-selected');
    }

    // Verify onboarding token
    let payload: { phone: string };
    try {
      payload = this.jwtService.verify(onboardingToken, {
        secret: this.configService.get<string>('jwt.onboardingSecret'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired onboarding token');
    }

    // Check duplicate
    const existingUser = await this.usersService.findByPhone(payload.phone);
    if (existingUser) {
      throw new ConflictException('User with this phone number already exists');
    }

    // Create user
    const user = await this.usersService.create({
      name,
      phone: payload.phone,
      role,
    });

    // Generate tokens
    const tokens = await this.generateTokenPair(user);

    return {
      isNewUser: false,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  // ─── Refresh ──────────────────────────────────────────────────────────

  async refresh(dto: RefreshTokenDto) {
    const { refreshToken } = dto;

    // Find the refresh token in DB
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const storedToken = await this.refreshTokenModel.findOne({
      where: { token: tokenHash },
      include: [{ model: User }],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // If the token is already revoked → potential reuse attack
    if (storedToken.isRevoked) {
      // Revoke all tokens for this user (reuse detection)
      await this.refreshTokenModel.update(
        { isRevoked: true },
        { where: { userId: storedToken.userId } },
      );
      this.logger.warn(
        `Refresh token reuse detected for user ${storedToken.userId}. All tokens revoked.`,
      );
      throw new UnauthorizedException('Refresh token reuse detected. All sessions revoked.');
    }

    // Check if expired
    if (new Date() > storedToken.expiresAt) {
      storedToken.isRevoked = true;
      await storedToken.save();
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke old token
    storedToken.isRevoked = true;
    await storedToken.save();

    // Issue new pair
    const user = storedToken.user;
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    const tokens = await this.generateTokenPair(user);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ─── Logout ───────────────────────────────────────────────────────────

  async logout(dto: LogoutDto) {
    const { refreshToken } = dto;
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const storedToken = await this.refreshTokenModel.findOne({
      where: { token: tokenHash },
    });

    if (storedToken) {
      storedToken.isRevoked = true;
      await storedToken.save();
    }

    return { message: 'Logged out successfully' };
  }

  // ─── Get Profile ──────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.sanitizeUser(user);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async generateTokenPair(user: User) {
    const plain = user.get({ plain: true }) as any;
    const jwtPayload: JwtPayload = { sub: plain.id, role: plain.role };

    // Access token (short-lived)
    const accessToken = this.jwtService.sign(jwtPayload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    });

    // Raw refresh token (opaque random string)
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');

    // Hash it before storing in DB
    const hashedRefreshToken = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // Calculate expiry
    const ttlDays = this.configService.get<number>('jwt.refreshTokenTtlDays', 30);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    // Store in DB
    await this.refreshTokenModel.create({
      token: hashedRefreshToken,
      userId: user.id,
      expiresAt,
    } as any);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private sanitizeUser(user: User) {
    const plain = user.get({ plain: true }) as any;
    return {
      id: plain.id,
      name: plain.name,
      phone: plain.phone,
      role: plain.role,
      deviceToken: plain.deviceToken ?? plain.device_token ?? null,
      isActive: plain.isActive ?? plain.is_active ?? true,
      createdAt: plain.createdAt ?? plain.created_at,
      updatedAt: plain.updatedAt ?? plain.updated_at,
    };
  }

  private async sendViaMSG91(phone: string, _otp: string): Promise<void> {
    const templateId = this.configService.get<string>('msg91.templateId');

    // TODO: Implement MSG91 HTTP call when production keys are ready
    this.logger.log(`MSG91 SMS queued for ${phone} with template ${templateId}`);
  }
}
