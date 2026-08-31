import { getCurrentUser } from "@/lib/current-user";
import ChangePassword from "./change-password";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await getCurrentUser();
  if (!me) return <div className="card text-sm text-slate-500">Please log in.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your account</h1>
        <p className="text-sm text-slate-500">
          {me.name || me.email} · {me.email} · {me.role === "OWNER" ? "Owner" : "Sales rep"}
        </p>
      </div>
      <ChangePassword />
    </div>
  );
}
