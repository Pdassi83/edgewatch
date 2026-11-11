import {SOL,USDC,DFLOW} from '../../lib/core.ts';

export const syntheticTipDestination='ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49';
function base58(bytes){
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let value=0n;
 for(const byte of bytes)value=value*256n+BigInt(byte);
 let result='';while(value){result=alphabet[Number(value%58n)]+result;value/=58n;}
 for(const byte of bytes){if(byte!==0)break;result='1'+result;}return result;
}
/** Fabricated balances and instruction data; no recorded transaction is used. */
export function syntheticDflowSwap(wallet,side='buy',variant=0){
 const balance=(mint,amount,accountIndex)=>({owner:wallet,mint,accountIndex,uiTokenAmount:{amount:String(amount),decimals:mint===SOL?9:6}});
 const before=[balance(SOL,1e9,0),balance(USDC,2e8,1)],after=[balance(SOL,2e9,0),balance(USDC,1e8,1)];
 const prefix=variant?[65,75,63,76,235,91,91,136]:[248,198,158,145,225,117,135,200];
 return {version:1,blockTime:Math.floor(Date.now()/1000),transaction:{message:{accountKeys:[{pubkey:wallet,signer:true}],instructions:[{programId:DFLOW,accounts:['synthetic-a','synthetic-b','synthetic-c',wallet],data:base58([...prefix,0])},{program:'system',parsed:{type:'transfer',info:{source:wallet,destination:syntheticTipDestination,lamports:1000}}}]}},meta:{err:null,preTokenBalances:side==='buy'?before:after,postTokenBalances:side==='buy'?after:before,innerInstructions:[]}};
}
