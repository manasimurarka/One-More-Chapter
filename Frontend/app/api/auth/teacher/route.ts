import { bcrypt, createSession, query, Role } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';
export const runtime='nodejs';
export async function POST(request:Request){const {username,password}=await request.json();const teacher=(await query<any>('SELECT * FROM teachers WHERE username=$1',[String(username||'')]))[0];if(!teacher||!await bcrypt.compare(String(password||''),teacher.password_hash))return Response.json({error:'Incorrect username or password.'},{status:401});const token=await createSession(Role.TEACHER,teacher.id);(await cookies()).set('omc_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:604800});return Response.json({teacher:{id:teacher.id,name:teacher.display_name}})}
