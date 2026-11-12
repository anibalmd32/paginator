import { Fragment, type ComponentProps } from 'react';

import { cx } from '@/lib/utils/cx';

import styles from './Kbd.module.css';

export interface KbdProps extends ComponentProps<'kbd'> {
  keys?: readonly string[];
  inverse?: boolean;
}

export function Kbd({ keys, inverse = false, className, children, ...rest }: KbdProps) {
  if (keys && keys.length > 1) {
    return (
      <kbd className={cx(styles.combo, className)} {...rest}>
        {keys.map((key, index) => (
          <Fragment key={`${key}-${index}`}>
            {index > 0 && <span className={styles.plus}>+</span>}
            <kbd className={cx(styles.key, inverse && styles.inverse)}>{key}</kbd>
          </Fragment>
        ))}
      </kbd>
    );
  }
  return (
    <kbd className={cx(styles.key, inverse && styles.inverse, className)} {...rest}>
      {keys?.[0] ?? children}
    </kbd>
  );
}
