import { createSession, Role, studentLogin } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';
export const runtime='nodejs';
export async function POST(request:Request){const {code,pin}=await request.json(); const result=await studentLogin(String(code||''),String(pin||'')); if(!result)return Response.json({error:'That classroom code or PIN did not match.'},{status:401}); const token=await createSession(Role.STUDENT,result.student.id); const store=await cookies(); store.set('omc_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:604800}); return Response.json({student:{id:result.student.id,name:result.student.displayName}})}
