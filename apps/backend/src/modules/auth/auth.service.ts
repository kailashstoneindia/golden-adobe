import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { Role, JwtPayload, VENDOR_ONBOARDING_STAGES } from '@golden-abode/types';
import { UsersService } from '../users/users.service';
import { CustomersService } from '../customers/customers.service';
import { RedisService } from '../../core/redis/redis.service';
import { RefreshToken } from '../users/models/refresh-token.model';
import { User } from '../users/models/user.model';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { AdminRegisterDto } from './dto/admin-register.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Fixed OTP while MSG91 / DLT is not live yet. */
  private static readonly DEMO_OTP = '123456';

  /** Flip via USE_MSG91_SMS=true once MSG91 DLT template is production-ready. */
  private readonly useMsg91Sms: boolean;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    private customersService: CustomersService,
    private redisService: RedisService,
    private readonly sequelize: Sequelize,
    @InjectModel(RefreshToken)
    private refreshTokenModel: typeof RefreshToken,
  ) {
    this.useMsg91Sms = this.configService.get<boolean>('msg91.useSms', false);
  }

  // ─── Send OTP ─────────────────────────────────────────────────────────

  async sendOtp(dto: SendOtpDto): Promise<{ message: string; devOtp?: string }> {
    const { phone } = dto;

    // Per-phone send limit (Redis-based). It exists to stop SMS spam against a
    // victim's number and to cap MSG91 cost, so it is enforced ONLY when real
    // SMS is on. In demo mode (USE_MSG91_SMS=false) nothing is sent or billed
    // and the code comes back in the response, so the limit protects nothing
    // and only locks testers out of their own accounts (decision 0057). It
    // switches itself back on with USE_MSG91_SMS=true; the verify-attempt
    // limit in verifyOtp is unaffected and always applies.
    const enforceSendLimit = this.useMsg91Sms;
    const rateLimitKey = `otp_rate:${phone}`;
    const attempts = enforceSendLimit ? await this.redisService.get(rateLimitKey) : null;
    const maxSends = this.configService.get<number>('throttle.otpSendLimit', 3);
    const rateTtl = this.configService.get<number>('throttle.otpSendTtl', 3600);

    if (enforceSendLimit && attempts && parseInt(attempts, 10) >= maxSends) {
      throw new BadRequestException(`OTP send limit exceeded. Try again after some time.`);
    }

    const env = this.configService.get<string>('env', 'development');

    const otp = this.useMsg91Sms
      ? crypto.randomInt(100000, 999999).toString()
      : AuthService.DEMO_OTP;

    // Hash the OTP and store in Redis with 5 minute TTL
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const otpKey = `otp:${phone}`;
    await this.redisService.set(otpKey, hashedOtp, 300); // 5 minutes

    // Increment rate limit counter (real SMS only — in demo mode no counter is
    // written, so flipping to real SMS starts every number from a clean slate).
    if (enforceSendLimit) {
      const currentCount = attempts ? parseInt(attempts, 10) : 0;
      await this.redisService.set(rateLimitKey, (currentCount + 1).toString(), rateTtl);
    }

    if (this.useMsg91Sms) {
      await this.sendViaMSG91(phone, otp);
      return { message: 'OTP sent successfully' };
    }

    this.logger.warn(
      `[DEMO OTP] ${phone}: ${otp} (${env}) — set USE_MSG91_SMS=true to send real SMS`,
    );

    return {
      message: 'OTP sent successfully (demo)',
      devOtp: otp,
    };
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
      // Decision 0058 Task 9: an admin switched this account off. The OTP was
      // right, but no tokens are issued (they would be refused on first use).
      if (!existingUser.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }
      // Existing user → generate tokens and return login response
      const tokens = await this.generateTokenPair(existingUser);
      await this.usersService.recordLogin(existingUser.id);
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

    // CUSTOMER has no separate onboarding step (unlike VENDOR, which
    // collects shop/address/GPS data afterward via POST /vendors/onboard) —
    // every cart/order service resolves a customers row by user id and 404s
    // ("no customer profile found for this user") without one, so it must
    // exist the moment registration completes.
    //
    // The user row and the customers row are ONE unit of work. As two bare
    // writes, a failure of the second left a login with no shopping profile
    // — a half-created account that nothing repaired. Inside a transaction
    // that failure rolls the user insert back too, so the caller can simply
    // register again.
    const user = await this.sequelize.transaction(async (transaction) => {
      const created = await this.usersService.create(
        { name, phone: payload.phone, role },
        transaction,
      );
      if (role === Role.CUSTOMER) {
        await this.customersService.createForUser(created.id, name, transaction);
      }
      return created;
    });

    // Generate tokens
    const tokens = await this.generateTokenPair(user);
    await this.usersService.recordLogin(user.id);

    return {
      isNewUser: false,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  // ─── Admin register / login (email + password + secret) ────────────────

  async registerAdmin(dto: AdminRegisterDto) {
    this.assertValidAdminRegistrationSecret(dto.secretKey);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersService.createAdmin({
      name: dto.name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    this.logger.log(`Admin registered: ${normalizedEmail}`);
    const tokens = await this.generateTokenPair(user);
    await this.usersService.recordLogin(user.id);
    return {
      isNewUser: false as const,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async loginAdmin(dto: AdminLoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user || user.role !== Role.ADMIN || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokenPair(user);
    await this.usersService.recordLogin(user.id);
    return {
      isNewUser: false as const,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  // Decision 0050. No email/SMS delivery exists for admin accounts, so
  // this reuses the same ADMIN_REGISTRATION_SECRET that already gates
  // "may create a new admin" — the same trust decision, extended to an
  // existing account instead of only a new one. Revokes every refresh
  // token for the user, same pattern refresh()'s reuse-detection branch
  // already uses: a credential change should not leave old sessions
  // standing.
  async resetAdminPassword(dto: AdminResetPasswordDto): Promise<{ success: true }> {
    this.assertValidAdminRegistrationSecret(dto.secretKey);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user || user.role !== Role.ADMIN) {
      throw new NotFoundException('No admin account with this email');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await user.update({ passwordHash });
    await this.refreshTokenModel.update({ isRevoked: true }, { where: { userId: user.id } });

    this.logger.log(`Admin password reset: ${normalizedEmail}`);
    return { success: true };
  }

  private assertValidAdminRegistrationSecret(secretKey: string): void {
    const expectedSecret = this.configService.get<string>('admin.registrationSecret', '');
    if (!expectedSecret) {
      throw new BadRequestException('Admin registration is not configured');
    }

    const providedBuffer = Buffer.from(secretKey);
    const expectedBuffer = Buffer.from(expectedSecret);
    if (providedBuffer.length !== expectedBuffer.length) {
      throw new UnauthorizedException('Invalid registration secret');
    }

    const isValidSecret = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    if (!isValidSecret) {
      throw new UnauthorizedException('Invalid registration secret');
    }
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

  async getProfile(userId: string, role?: Role) {
    const user = await this.usersService.findById(userId, role);
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
      phone: plain.phone ?? null,
      email: plain.email ?? null,
      role: plain.role,
      deviceToken: plain.deviceToken ?? plain.device_token ?? null,
      isActive: plain.isActive ?? plain.is_active ?? true,
      isApproved: plain.isApproved ?? plain.is_approved ?? false,
      onboardingCompleted:
        plain.onboardingCompleted ?? plain.onboarding_completed ?? Boolean(plain.vendorProfile),
      onboardingCompletedAt: plain.onboardingCompletedAt ?? plain.onboarding_completed_at ?? null,
      onboardingStage:
        plain.onboardingStage ??
        plain.onboarding_stage ??
        (plain.vendorProfile ? VENDOR_ONBOARDING_STAGES.completed : null),
      vendorProfile: plain.vendorProfile
        ? {
            id: plain.vendorProfile.id,
            userId: plain.vendorProfile.userId ?? plain.vendorProfile.user_id,
            shopName: plain.vendorProfile.shopName ?? plain.vendorProfile.shop_name,
            address: plain.vendorProfile.address,
            latitude: plain.vendorProfile.latitude,
            longitude: plain.vendorProfile.longitude,
            upiId: plain.vendorProfile.upiId ?? plain.vendorProfile.upi_id,
            bankDetails: plain.vendorProfile.bankDetails ?? plain.vendorProfile.bank_details,
            accountDetails: plain.vendorProfile.accountDetails
              ? {
                  id: plain.vendorProfile.accountDetails.id,
                  vendorId:
                    plain.vendorProfile.accountDetails.vendorId ??
                    plain.vendorProfile.accountDetails.vendor_id,
                  accountHolderName:
                    plain.vendorProfile.accountDetails.accountHolderName ??
                    plain.vendorProfile.accountDetails.account_holder_name,
                  bankName:
                    plain.vendorProfile.accountDetails.bankName ??
                    plain.vendorProfile.accountDetails.bank_name,
                  ifscCode:
                    plain.vendorProfile.accountDetails.ifscCode ??
                    plain.vendorProfile.accountDetails.ifsc_code,
                  branchName:
                    plain.vendorProfile.accountDetails.branchName ??
                    plain.vendorProfile.accountDetails.branch_name,
                  accountNumber:
                    plain.vendorProfile.accountDetails.accountNumber ??
                    plain.vendorProfile.accountDetails.account_number,
                  createdAt:
                    plain.vendorProfile.accountDetails.createdAt ??
                    plain.vendorProfile.accountDetails.created_at,
                  updatedAt:
                    plain.vendorProfile.accountDetails.updatedAt ??
                    plain.vendorProfile.accountDetails.updated_at,
                }
              : null,
            gstin: plain.vendorProfile.gstin,
            createdAt: plain.vendorProfile.createdAt ?? plain.vendorProfile.created_at,
            updatedAt: plain.vendorProfile.updatedAt ?? plain.vendorProfile.updated_at,
          }
        : undefined,
      createdAt: plain.createdAt ?? plain.created_at,
      updatedAt: plain.updatedAt ?? plain.updated_at,
    };
  }

  /** Sends OTP via MSG91 — only called when `USE_MSG91_SMS` is true. */
  private async sendViaMSG91(phone: string, otp: string): Promise<void> {
    const authKey = this.configService.get<string>('msg91.authKey');
    const templateId = this.configService.get<string>('msg91.templateId');

    if (!authKey || !templateId) {
      this.logger.error('MSG91 credentials missing — set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID');
      throw new BadRequestException('SMS service is not configured. Try again later.');
    }

    const mobile = phone.replace(/\D/g, '');

    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile,
        otp,
        otp_length: 6,
        otp_expiry: 5,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      type?: string;
      message?: string;
    };

    if (!response.ok || data.type === 'error') {
      this.logger.error(`MSG91 OTP failed for ${phone}: ${JSON.stringify(data)}`);
      throw new BadRequestException('Could not send OTP. Try again later.');
    }

    this.logger.log(`MSG91 OTP sent to ${phone}`);
  }
}
