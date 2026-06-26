import { Role } from './role.enum';

/**
 * Full user DTO returned by the API.
 * Matches the shape of the `users` table row exposed to clients.
 */
export interface UserDto {
  id: string;
  name: string;
  phone: string;
  role: Role;
  deviceToken: string | null;
  isActive: boolean;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload embedded inside access tokens.
 * Keep it small — only sub + role, no PII.
 */
export interface JwtPayload {
  sub: string;
  role: Role;
}
