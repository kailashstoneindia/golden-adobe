import type { UserDto } from '@golden-abode/types';

import styles from '@/styles/shared.module.css';
import { formatRoleLabel } from '@/utils/role';
import { formatPhoneDisplay } from '@/utils/phone';

type ApprovalCardProps = {
  user: UserDto;
  onSelect: (user: UserDto) => void;
};

export function ApprovalCard({ user, onSelect }: ApprovalCardProps) {
  const handleClick = () => onSelect(user);

  return (
    <button type="button" className={styles.card} onClick={handleClick}>
      <div className={styles.cardTop}>
        <h3 className={styles.name}>{user.name || 'Unnamed user'}</h3>
        <span className={styles.badge}>Pending</span>
      </div>
      <p className={styles.meta}>{formatRoleLabel(user.role)}</p>
      <p className={styles.meta}>{formatPhoneDisplay(user.phone)}</p>
    </button>
  );
}
