import { contactFormEmail, launchpadDigestEmail, coldOutreachEmail, type BuiltEmail } from "@/lib/email/templates";

// One place that renders every email with realistic sample data, so the
// preview page and the "send test" both use the same thing. Add a template
// here and it shows up in both automatically.
export interface EmailSample {
  key: string;
  label: string;
  description: string;
  build: () => BuiltEmail;
}

export function emailSamples(): EmailSample[] {
  const base = process.env.ADMIN_BASE_URL || "https://admin.heylily.ai";
  const address = process.env.COMPANY_ADDRESS || "Hey Lily · 123 Example St, Fort Myers, FL 33901";

  return [
    {
      key: "contact-form",
      label: "Contact-form enquiry",
      description: "Sent to the client when someone fills out their website's contact form.",
      build: () =>
        contactFormEmail({
          clientName: "Hamilton Law Office",
          sourceUrl: "hamiltonlawoffice.com",
          fields: {
            Name: "Jane Whitfield",
            Phone: "(239) 555-0148",
            Email: "jane.whitfield@example.com",
            Message: "I'm going through a custody dispute and need to speak with an attorney this week.",
          },
          replyEmail: "jane.whitfield@example.com",
        }),
    },
    {
      key: "launchpad-digest",
      label: "Launchpad daily digest",
      description: "Your daily ops email of paid accounts that aren't live yet.",
      build: () =>
        launchpadDigestEmail({
          baseUrl: base,
          pending: [
            { name: "Ogden's Auto Body", id: "sample1", days: 9, blockedAt: "Deployed live", doneCount: 3, total: 5 },
            { name: "Valley Collision UT", id: "sample2", days: 4, blockedAt: "Domain connected", doneCount: 2, total: 5 },
            { name: "Ray's Auto Body", id: "sample3", days: 1, blockedAt: "Website built", doneCount: 1, total: 5 },
          ],
        }),
    },
    {
      key: "cold-outreach",
      label: "Cold outreach (Chunk C)",
      description: "The personalized cold email that will go to prospects with their score.",
      build: () =>
        coldOutreachEmail({
          businessName: "Hamilton Law Office",
          trustScore: 62,
          afterScore: 92,
          topIssues: [
            "Text on your site is hard to read on phones and for older clients, so they leave before calling.",
            "Google and AI search can't read your business details, so you're invisible for local searches.",
            "Your contact form is hard to complete, costing you leads at the finish line.",
          ],
          reportUrl: `${base}/demo/sample/report`,
          bookUrl: "https://heylily.ai",
          address,
          unsubscribeUrl: `${base}/unsubscribe/sample`,
        }),
    },
  ];
}
