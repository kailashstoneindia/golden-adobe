import { PartialType } from '@nestjs/swagger';
import { CreateTeamMemberDto } from './create-team-member.dto';

// Every field in CreateTeamMemberDto is already optional (spec §8.3), so
// this partial update is identical in shape — derived instead of
// hand-duplicated, so the two can't drift apart.
export class UpdateTeamMemberDto extends PartialType(CreateTeamMemberDto) {}
