import {prisma} from '../config/database';
export const normalizeLaunchEmail=(email:string)=>email.trim().toLowerCase();
export async function isLaunchAllowlisted(email:string){const row=await prisma.launchAllowlist.findUnique({where:{email:normalizeLaunchEmail(email)}});return row?.enabled===true}
