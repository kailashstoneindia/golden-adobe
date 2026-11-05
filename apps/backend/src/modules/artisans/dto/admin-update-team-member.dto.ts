import { PickType } from '@nestjs/swagger';
import { CreateTeamMemberDto } from './create-team-member.dto';

// Decision 0058 Task 11: an admin corrects a member's name, role or phone. The
// document is left out on purpose: uploading on an ustaad's behalf needs an
// admin upload flow (see the plan's "Later" list), so it cannot be changed here.
export class AdminUpdateTeamMemberDto extends PickType(CreateTeamMemberDto, [
  'name',
  'roleOnTeam',
  'phone',
] as const) {}
