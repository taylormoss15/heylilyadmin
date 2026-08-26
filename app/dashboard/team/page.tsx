import { prisma } from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/current-user";
import TeamManager from "./team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="card text-sm text-slate-500">
        Only owners can manage the team.
      </div>
    );
  }

  const users = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Team</h1>
        <p className="text-sm text-slate-500">Add sales reps and give them a login. Leads you assign show up on their board.</p>
      </div>
      <TeamManager
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          calendlyUrl: u.calendlyUrl,
          phone: u.phone,
          sendingEmail: u.sendingEmail,
          isMe: u.id === me!.id,
        }))}
      />
    </div>
  );
}
