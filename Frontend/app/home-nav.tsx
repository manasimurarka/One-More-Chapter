'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './home-nav.module.css';

export function HomeNav() {
  const pathname = usePathname();

  if (pathname === '/') return null;

  const label = pathname.startsWith('/teacher')
    ? 'Not a teacher? Return home'
    : pathname.startsWith('/student')
      ? 'Not a student? Return home'
      : 'Return home';

  return <Link className={styles.homeNav} href="/">{label}</Link>;
}
