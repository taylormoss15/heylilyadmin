import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import ChangePassword from "./change-password";
import Bookmarklet from "./bookmarklet";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await getCurrentUser();
  if (!me) return <div className="card text-sm text-slate-500">Please log in.</div>;

  const user = await prisma.adminUser.findUnique({ where: { id: me.id }, select: { captureToken: true } });
  const baseUrl = (process.env.ADMIN_BASE_URL || "https://admin.heylily.ai").replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your account</h1>
        <p className="text-sm text-slate-500">
          {me.name || me.email} · {me.email} · {me.role === "OWNER" ? "Owner" : "Sales rep"}
        </p>
      </div>
      <Bookmarklet initialToken={user?.captureToken ?? null} baseUrl={baseUrl} />
      <ChangePassword />
    </div>
  );
}
