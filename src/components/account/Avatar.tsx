import { useState } from 'react';

import type { CloudUser } from '@/lib/cloud';
import { cx } from '@/lib/utils/cx';

import { initials } from './accountModel';
import styles from './Avatar.module.css';

export interface AvatarProps {
  user: CloudUser | null;
  size?: number;
  className?: string | undefined;
}

export function Avatar({ user, size = 24, className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = user?.avatarUrl ?? null;
  const showImage = url !== null && failed !== url;
  return (
    <span className={cx(styles.avatar, className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {showImage ? (
        <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(url)} />
      ) : (
        initials(user)
      )}
    </span>
  );
}
