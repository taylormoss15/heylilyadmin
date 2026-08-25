import { contactFormEmail, launchpadDigestEmail, coldOutreachEmail, newSaleEmail, type BuiltEmail } from "@/lib/email/templates";

// One place that renders every email with realistic sample data, so the
// preview page and the "send test" both use the same thing. Add a template
// here and it shows up in both automatically.
export interface EmailSample {
  key: string;
  label: string;
  category: string;
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
      category: "Customer-facing",
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
      category: "Hey Lily Admin",
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
      key: "new-sale",
      label: "New sale alert",
      category: "Hey Lily Admin",
      description: "Emailed to you the moment an account goes paid.",
      build: () => newSaleEmail({ clientName: "Hamilton Law Office", baseUrl: base, clientId: "sample" }),
    },
    {
      key: "cold-outreach",
      label: "Cold outreach — score email",
      category: "Outreach / Sales",
      description: "The personalized cold email that will go to prospects with their score.",
      build: () =>
        coldOutreachEmail({
          firstName: "David",
          firmName: "Hamilton Law Office",
          score: 62,
          newScore: 92,
          beforeShotUrl: null,
          afterShotUrl: null,
          accessibilityIssue: "Low color contrast and text that's hard to read on phones and for older clients",
          mobileIssue: "The phone number isn't tap-to-call and the booking button is buried below the fold",
          seoIssue: "No structured data or local-service pages, so Google can't confidently rank you for your practice areas",
          conversionIssue: "No reviews or clear next step above the fold, so visitors leave before contacting you",
          reportUrl: `${base}/demo/sample/report`,
          senderName: "Taylor",
          senderPhone: "(239) 555-0100",
          address,
          unsubscribeUrl: `${base}/unsubscribe/sample`,
        }),
    },
  ];
}
