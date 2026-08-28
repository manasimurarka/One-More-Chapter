import './globals.css';
import { HomeNav } from './home-nav';
export const metadata={title:'One More Chapter',description:'A reading companion for curious kids'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><HomeNav />{children}</body></html>}
