import { getCurrentUser, isOwner } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { outreachRecipients } from "@/lib/prospecting/recipients";
import AdminPreviewBanner from "./admin-preview-banner";

export default async function DemoLayout({ children, params }: { children: React.ReactNode; params: { token: string } }) {
  const me = await getCurrentUser();
  // Public links never include internal contacts or editing controls.
  if (!me) return children;
  const prospect = await prisma.prospect.findFirst({ where: { demoToken: params.token } });
  if (!prospect || (!isOwner(me) && prospect.ownerId !== me.id)) return children;
  const recipients = outreachRecipients(prospect);
  const blocked = prospect.unsubscribedAt ? "This lead is unsubscribed." : prospect.emailedAt ? "Outreach has already been sent." : !prospect.ownerId ? "Assign a rep before queueing." : !recipients.length ? "Add a recipient before queueing." : null;
  return <>
    <AdminPreviewBanner prospectId={prospect.id} recipients={recipients} reviewStatus={prospect.reviewStatus} blocked={blocked} aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />
    {children}
  </>;
}
