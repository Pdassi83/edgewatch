import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'EDGEWATCH | Laboratório de paper trading',description:'Observação on-chain e simulação conservadora em Solana.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-PT"><body>{children}</body></html>}
