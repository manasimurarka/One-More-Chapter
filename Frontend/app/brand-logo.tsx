import Image from 'next/image';
import logo from '../assets/logo.png';

export function BrandLogo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand">
      <Image src={logo} alt="One More Chapter" className="brand-logo" priority />
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}
