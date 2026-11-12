import type { ComponentProps } from 'react';

import { cx } from '@/lib/utils/cx';

export type VisuallyHiddenProps = ComponentProps<'span'>;

export function VisuallyHidden({ className, ...rest }: VisuallyHiddenProps) {
  return <span className={cx('visually-hidden', className)} {...rest} />;
}
