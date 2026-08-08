import { emailSamples } from "@/lib/email/samples";
import EmailPreview from "./email-preview";

export const dynamic = "force-dynamic";

export default function EmailsPage() {
  const samples = emailSamples().map((s) => {
    const built = s.build();
    return {
      key: s.key,
      label: s.label,
      category: s.category,
      description: s.description,
      subject: built.subject,
      html: built.html,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Emails</h1>
        <p className="text-sm text-slate-500">
          Preview every email exactly as it lands, and send yourself a live test before anything goes out.
        </p>
      </div>
      <EmailPreview samples={samples} />
    </div>
  );
}
